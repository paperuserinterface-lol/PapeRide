'use strict';

/**
 * TBRide :: Telegram bridge service.
 *
 * The PapeRide Telegram bot (Java) talks to the website through the guarded
 * /api/telegram/* routes. Bookings land in the SAME ride_requests table the
 * web clients use, so a Telegram rider appears on the operator dispatch board
 * in real time and can be dispatched by operators/drivers exactly like a web
 * rider — no second source of truth.
 *
 * Rider identity: Telegram users have no phone number, so their account is
 * keyed by the synthetic phone `tg:<telegram_user_id>` (UNIQUE in users).
 * They always have role = 'user' and a random password hash they can never
 * log in with — the website is not their authentication channel.
 */

const crypto = require('crypto');
const usersRepo = require('../repositories/users.repository');
const ridesRepo = require('../repositories/rides.repository');
const ridesService = require('./rides.service');
const systemLogs = require('../repositories/logs.repository');
const events = require('../realtime/ride.events');
const { serialiseRide } = require('../realtime/snapshots');
const { hashPassword } = require('../utils/password');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { assertOptionalLabel } = require('../utils/validation');

/** Synthetic phone key that links a Telegram user to a website account. */
const PHONE_PREFIX = 'tg:';

function phoneFor(telegramUserId) {
  return `${PHONE_PREFIX}${telegramUserId}`;
}

function assertTelegramUserId(value) {
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ValidationError('telegram_user_id must be a positive integer', {
      field: 'telegram_user_id',
    });
  }
  return num;
}

/** first_name > username > 'Telegram Rider', trimmed to the column size. */
function pickDisplayName(firstName, username) {
  const raw = [firstName, username]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0);
  const name = raw && raw.length >= 2 ? raw : 'Telegram Rider';
  return name.slice(0, 120);
}

/**
 * Find (or create) the website account behind a Telegram user.
 * Concurrent first-time bookings race on the unique phone number, so a
 * lost insert race simply re-reads the winner's row.
 */
async function ensureRider(telegramUserId, { username = null, firstName = null } = {}) {
  const phone = phoneFor(telegramUserId);
  const displayName = pickDisplayName(firstName, username);

  const existing = await usersRepo.findByPhone(phone);
  if (existing) {
    if (existing.full_name !== displayName) {
      await usersRepo.update(existing.id, { fullName: displayName });
      existing.full_name = displayName;
    }
    return existing;
  }

  const passwordHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
  try {
    return await usersRepo.create({
      fullName: displayName,
      phoneNumber: phone,
      role: 'user',
      passwordHash,
    });
  } catch (err) {
    if (err && err.code === '23505') {
      const winner = await usersRepo.findByPhone(phone);
      if (winner) return winner;
    }
    throw err;
  }
}

/**
 * Book a ride for a Telegram user. Same state machine and same realtime
 * events as user:request_ride, plus a telegram-specific audit entry.
 *
 * @param {number|string} telegramUserId
 * @param {{username?:string|null, firstName?:string|null}} profile
 * @param {{pickup_lat:*, pickup_lng:*, dropoff_lat:*, dropoff_lng:*,
 *          pickup_label?:string|null, dropoff_label?:string|null}} payload
 */
async function bookRide(telegramUserId, profile = {}, payload = {}) {
  const tgId = assertTelegramUserId(telegramUserId);
  const rider = await ensureRider(tgId, profile);

  const identity = { id: rider.id, role: 'user', name: rider.full_name };
  const result = await ridesService.createRide(identity, {
    pickup_lat: payload.pickup_lat,
    pickup_lng: payload.pickup_lng,
    dropoff_lat: payload.dropoff_lat,
    dropoff_lng: payload.dropoff_lng,
    pickup_label: assertOptionalLabel(payload.pickup_label, 'pickup_label'),
    dropoff_label: assertOptionalLabel(payload.dropoff_label, 'dropoff_label'),
  });
  const ride = result.ride;

  await systemLogs.log({
    actorId: rider.id,
    actorRole: 'user',
    event: 'telegram.ride_requested',
    entityId: ride.id,
    level: 'info',
    details: { telegramUserId: tgId, channel: 'telegram' },
  });

  events.emitRideCreated(ride);
  events.emitNewRideRequest(ride);

  return { ride: serialiseRide(ride), quote: result.quote };
}

/** Latest rides of a Telegram rider, newest first (serialised for the bot). */
async function listRides(telegramUserId, { limit = 10 } = {}) {
  const tgId = assertTelegramUserId(telegramUserId);
  const rider = await usersRepo.findByPhone(phoneFor(tgId));
  if (!rider) return [];
  const rides = await ridesRepo.listByUser(rider.id, { limit });
  return rides.map(serialiseRide);
}

/** Cancel one of the rider's own cancellable rides (pending / assigned). */
async function cancelRide(telegramUserId, rideId, reason = 'cancelled_by_rider') {
  const tgId = assertTelegramUserId(telegramUserId);
  const rider = await usersRepo.findByPhone(phoneFor(tgId));
  if (!rider) throw new NotFoundError('Ride not found');

  const identity = { id: rider.id, role: 'user', name: rider.full_name };
  const result = await ridesService.cancelRide(identity, rideId, reason);
  const ride = result.ride;

  events.emitRideStatusUpdate({
    ride,
    previousStatus: result.releasedDriverId || ride.status === 'cancelled' ? 'assigned' : 'pending',
    stage: 'cancelled_by_rider',
    actor: { id: rider.id, role: 'user', name: rider.full_name },
  });
  events.emitRideRemovedFromBoard(ride.id, 'cancelled');
  if (result.releasedDriverId) {
    events.emitRideWithdrawn(ride.id, result.releasedDriverId, 'cancelled_by_rider');
  }

  return { ride: serialiseRide(ride) };
}

module.exports = {
  PHONE_PREFIX,
  phoneFor,
  assertTelegramUserId,
  ensureRider,
  bookRide,
  listRides,
  cancelRide,
};
