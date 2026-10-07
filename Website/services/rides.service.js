'use strict';

/**
 * TBRide :: ride domain service.
 * Owns the ride state machine. The server, never the client, decides whether a
 * transition is legal.
 *
 *   pending -> assigned -> in_progress -> completed
 *      \          \
 *       ---------->--------> cancelled
 */

const ridesRepo = require('../repositories/rides.repository');
const driversRepo = require('../repositories/drivers.repository');
const usersRepo = require('../repositories/users.repository');
const systemLogs = require('../repositories/logs.repository');
const { transaction } = require('../db');
const config = require('../config');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
} = require('../utils/errors');
const {
  validateRidePayload,
  assertUuid,
  assertOptionalLabel,
  haversineKm,
} = require('../utils/validation');

const TRANSITIONS = {
  pending: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

/** Statuses a rider/operator may still cancel. */
const CANCELLABLE = ['pending', 'assigned'];

function assertRideTransition(from, to) {
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw new ConflictError(`Illegal ride transition: ${from} -> ${to}`);
  }
}

function quote(pickup, dropoff) {
  const distanceKm = haversineKm(
    Number(pickup.pickup_lat),
    Number(pickup.pickup_lng),
    Number(dropoff.dropoff_lat),
    Number(dropoff.dropoff_lng)
  );
  const fare = Math.round(
    config.ride.baseFare + distanceKm * config.ride.perKm
  );
  const etaMinutes = Math.max(
    3,
    Math.round((distanceKm / config.ride.avgSpeedKmh) * 60)
  );
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    fare,
    etaMinutes,
  };
}

/**
 * user:request_ride
 * @param {{id:string,role:string,name:string}} identity
 */
async function createRide(identity, payload) {
  if (identity.role !== 'user') {
    throw new ValidationError('Only riders can request rides');
  }
  const riderId = assertUuid(identity.id, 'user id');
  const body = validateRidePayload(payload || {});

  // Business rule: a rider cannot have two rides being served at the same time
  // (hard-guarded by the ride_requests_one_active_per_user unique index).
  // Several *pending* requests are allowed — that is what the dispatch board
  // shows, and it allows multiple pending requests for one rider.
  const active = await ridesRepo.findActiveRideByUser(riderId);
  if (active) {
    throw new ConflictError('You already have a ride in progress', { rideId: active.id });
  }

  const created = await ridesRepo.insert(
    {
      userId: riderId,
      pickupLat: body.pickupLat,
      pickupLng: body.pickupLng,
      dropoffLat: body.dropoffLat,
      dropoffLng: body.dropoffLng,
      // Optional addresses (Telegram channel); NULL for map-only requests.
      pickupLabel: assertOptionalLabel(payload.pickup_label, 'pickup_label'),
      dropoffLabel: assertOptionalLabel(payload.dropoff_label, 'dropoff_label'),
    }
  );

  const ride = await ridesRepo.findById(created.id);
  await systemLogs.log({
    actorId: riderId,
    actorRole: 'user',
    event: 'ride.requested',
    entityId: created.id,
    level: 'info',
    details: { pickup: [body.pickupLat, body.pickupLng], dropoff: [body.dropoffLat, body.dropoffLng] },
  });

  return { ride, quote: quote(ride, ride) };
}

/**
 * Operator manual dispatch (drag & drop) and driver self-accept share this
 * transaction. Row locks (FOR UPDATE) + a partial unique index guarantee that
 * two operators can never assign the same driver to two rides at once.
 *
 * @param {{operatorId?:string, driverId:string, rideId:string, via:string}} args
 */
async function assignRide({ operatorId = null, driverId, rideId, via = 'operator' }) {
  const targetDriverId = assertUuid(driverId, 'driver id');
  const targetRideId = assertUuid(rideId, 'ride id');
  const validatedOperatorId = operatorId ? assertUuid(operatorId, 'operator id') : null;

  return transaction(async (client) => {
    // 1. Operator exists and is authorised (admin may dispatch too).
    if (validatedOperatorId) {
      const operator = await usersRepo.lockById(validatedOperatorId, client);
      if (!operator) throw new NotFoundError('Operator not found');
      if (operator.role !== 'operator' && operator.role !== 'admin') {
        throw new ValidationError('Account is not authorised to dispatch rides');
      }
    }

    // 2. Ride exists and is dispatchable (locked for the whole transaction).
    const ride = await ridesRepo.lockById(targetRideId, client);
    if (!ride) throw new NotFoundError('Ride not found');
    if (!['pending', 'assigned'].includes(ride.status)) {
      throw new ConflictError(`Ride is ${ride.status} and can no longer be dispatched`);
    }

    // 3. Driver exists and really is a driver (locked second: stable lock order).
    const driver = await driversRepo.lockById(targetDriverId, client);
    if (!driver || driver.role !== 'driver') {
      throw new NotFoundError('Driver not found');
    }

    // Idempotent re-assignment: nothing to do.
    if (ride.assigned_driver_id === targetDriverId && ride.status === 'assigned') {
      const current = await ridesRepo.findById(targetRideId, client);
      return { ride: current, driver, reassigned: false, unchanged: true };
    }

    // 4. Driver must be online (not offline, not already busy).
    if (driver.status === 'offline') {
      throw new ConflictError('Driver is offline and cannot accept rides');
    }
    if (driver.status === 'active') {
      throw new ConflictError('Driver is already handling a ride');
    }

    // 5. Driver must not hold another live ride.
    const liveRide = await ridesRepo.findLiveRideByDriver(targetDriverId, client);
    if (liveRide && liveRide.id !== targetRideId) {
      throw new ConflictError('Driver is already assigned to another ride', {
        rideId: liveRide.id,
      });
    }

    // 7. Release the previous driver when re-assigning.
    const previousDriverId = ride.assigned_driver_id;
    if (previousDriverId && previousDriverId !== targetDriverId) {
      await driversRepo.updateStatus(previousDriverId, 'online', client);
    }

    // 8. Commit the assignment: ride -> assigned, driver -> active.
    const updated = await ridesRepo.setStatus(
      targetRideId,
      'assigned',
      { assignedDriverId: targetDriverId, operatorId: validatedOperatorId },
      client
    );
    await driversRepo.updateStatus(targetDriverId, 'active', client);

    await systemLogs.log({
      actorId: validatedOperatorId,
      actorRole: validatedOperatorId ? 'operator' : 'driver',
      event: 'ride.assigned',
      entityId: targetRideId,
      level: 'info',
      details: {
        driverId: targetDriverId,
        via,
        reassigned: Boolean(previousDriverId && previousDriverId !== targetDriverId),
      },
    });

    const fullRide = await ridesRepo.findById(targetRideId, client);
    return {
      ride: fullRide || updated,
      driver,
      reassigned: Boolean(previousDriverId && previousDriverId !== targetDriverId),
      previousDriverId: previousDriverId || null,
      unchanged: false,
    };
  });
}

/**
 * driver:accept_ride — driver self-dispatch of a pending ride.
 */
async function acceptRide(identity, rideId) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can accept rides');
  const result = await assignRide({
    driverId: identity.id,
    rideId,
    via: 'driver_accept',
  });
  return result;
}

/**
 * driver:decline_ride — informational; the ride stays pending so an operator
 * (or another driver) can pick it up.
 */
async function declineRide(identity, rideId, reason) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can decline rides');
  const id = assertUuid(rideId, 'ride id');
  const ride = await ridesRepo.findById(id);
  if (!ride) throw new NotFoundError('Ride not found');
  if (ride.assigned_driver_id && ride.assigned_driver_id !== identity.id) {
    throw new ValidationError('This ride is offered to another driver');
  }
  await systemLogs.log({
    actorId: identity.id,
    actorRole: 'driver',
    event: 'ride.declined',
    entityId: id,
    level: 'warn',
    details: { reason: reason || null, rideStatus: ride.status },
  });
  return { rideId: id, declinedBy: identity.id };
}

/**
 * user:cancel_ride / operator cancel / admin cancel.
 */
async function cancelRide(identity, rideId, reason) {
  const id = assertUuid(rideId, 'ride id');
  const actorRole = identity.role;

  return transaction(async (client) => {
    const ride = await ridesRepo.lockById(id, client);
    if (!ride) throw new NotFoundError('Ride not found');

    if (actorRole === 'user' && ride.user_id !== identity.id) {
      throw new ValidationError('Riders can only cancel their own rides');
    }
    if (actorRole === 'driver' && ride.assigned_driver_id !== identity.id) {
      throw new ValidationError('Ride is not assigned to you');
    }
    if (!['user', 'operator', 'admin', 'driver'].includes(actorRole)) {
      throw new ValidationError('Role cannot cancel rides');
    }
    if (actorRole === 'driver' && ride.status === 'in_progress') {
      throw new ConflictError('Contact the operator to cancel a started ride');
    }
    if (!CANCELLABLE.includes(ride.status)) {
      throw new ConflictError(`Ride is ${ride.status} and cannot be cancelled`);
    }

    assertRideTransition(ride.status, 'cancelled');

    // Free the driver again.
    let releasedDriverId = null;
    if (ride.assigned_driver_id && ride.status === 'assigned') {
      await driversRepo.updateStatus(ride.assigned_driver_id, 'online', client);
      releasedDriverId = ride.assigned_driver_id;
    }

    await ridesRepo.setStatus(id, 'cancelled', {}, client);
    const updated = await ridesRepo.findById(id, client);

    await systemLogs.log({
      actorId: identity.id,
      actorRole,
      event: 'ride.cancelled',
      entityId: id,
      level: 'warn',
      details: { reason: reason || null, releasedDriverId, previousStatus: ride.status },
    });

    return { ride: updated, releasedDriverId };
  });
}

/**
 * driver:arrived — the ride stays "assigned", the arrival is recorded and
 * broadcast so the rider sees the driver waiting.
 */
async function markArrived(identity, rideId) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can mark arrival');
  const id = assertUuid(rideId, 'ride id');

  const ride = await ridesRepo.findById(id);
  if (!ride) throw new NotFoundError('Ride not found');
  if (ride.assigned_driver_id !== identity.id) {
    throw new ValidationError('Ride is not assigned to you');
  }
  if (ride.status !== 'assigned') {
    throw new ConflictError(`Cannot mark arrival on a ${ride.status} ride`);
  }
  await systemLogs.log({
    actorId: identity.id,
    actorRole: 'driver',
    event: 'ride.arrived',
    entityId: id,
    level: 'info',
    details: {},
  });
  return { rideId: id, stage: 'arrived' };
}

async function startRide(identity, rideId) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can start rides');
  const id = assertUuid(rideId, 'ride id');

  return transaction(async (client) => {
    const ride = await ridesRepo.lockById(id, client);
    if (!ride) throw new NotFoundError('Ride not found');
    if (ride.assigned_driver_id !== identity.id) {
      throw new ValidationError('Ride is not assigned to you');
    }
    assertRideTransition(ride.status, 'in_progress');
    const updated = await ridesRepo.setStatus(id, 'in_progress', {}, client);
    await systemLogs.log({
      actorId: identity.id,
      actorRole: 'driver',
      event: 'ride.started',
      entityId: id,
      details: {},
    });
    const full = await ridesRepo.findById(id, client);
    return { ride: full || updated };
  });
}

async function completeRide(identity, rideId) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can complete rides');
  const id = assertUuid(rideId, 'ride id');

  return transaction(async (client) => {
    const ride = await ridesRepo.lockById(id, client);
    if (!ride) throw new NotFoundError('Ride not found');
    if (ride.assigned_driver_id !== identity.id) {
      throw new ValidationError('Ride is not assigned to you');
    }
    assertRideTransition(ride.status, 'completed');

    await ridesRepo.setStatus(id, 'completed', {}, client);
    // After completion the driver is available again.
    await driversRepo.updateStatus(identity.id, 'online', client);

    const full = await ridesRepo.findById(id, client);
    const driver = await driversRepo.findById(identity.id, client);

    await systemLogs.log({
      actorId: identity.id,
      actorRole: 'driver',
      event: 'ride.completed',
      entityId: id,
      details: {
        distanceKm: quote(full, full).distanceKm,
        fare: quote(full, full).fare,
      },
    });

    return { ride: full, driver };
  });
}

async function listForUser(identity) {
  const id = assertUuid(identity.id, 'user id');
  return ridesRepo.listByUser(id);
}

async function listForDriver(identity) {
  const id = assertUuid(identity.id, 'driver id');
  return ridesRepo.listByDriver(id);
}

async function getRide(identity, rideId) {
  const id = assertUuid(rideId, 'ride id');
  const ride = await ridesRepo.findById(id);
  if (!ride) throw new NotFoundError('Ride not found');
  if (identity.role === 'user' && ride.user_id !== identity.id) {
    throw new ValidationError('Riders can only read their own rides');
  }
  return ride;
}

module.exports = {
  TRANSITIONS,
  quote,
  createRide,
  assignRide,
  acceptRide,
  declineRide,
  cancelRide,
  markArrived,
  startRide,
  completeRide,
  listForUser,
  listForDriver,
  getRide,
};
