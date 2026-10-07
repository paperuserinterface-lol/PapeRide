'use strict';

/**
 * TBRide :: driver domain service.
 * Owns the driver state machine: offline <-> online -> active -> online.
 */

const driversRepo = require('../repositories/drivers.repository');
const ridesRepo = require('../repositories/rides.repository');
const usersRepo = require('../repositories/users.repository');
const systemLogs = require('../repositories/logs.repository');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { validateLocationPayload, assertUuid } = require('../utils/validation');

const TRANSITIONS = {
  offline: ['online'],
  online: ['offline', 'active'],
  active: ['online'],
};

function assertTransition(from, to) {
  if (from === to) return { changed: false, from, to };
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw new ConflictError(`Driver cannot go from "${from}" to "${to}"`);
  }
  return { changed: true, from, to };
}

/**
 * driver:status_change
 * @param {{id:string, role:string, name:string}} identity authenticated identity
 * @param {string} requestedStatus
 */
async function changeStatus(identity, requestedStatus) {
  if (identity.role !== 'driver') throw new ValidationError('Only drivers can change driver status');
  const target = String(requestedStatus || '').trim().toLowerCase();

  const driver = await driversRepo.findById(identity.id);
  if (!driver) throw new NotFoundError('Driver profile not found');

  const current = driver.status;
  const next = ['offline', 'online', 'active'].includes(target) ? target : null;
  if (!next) throw new ValidationError('Invalid driver status');

  // A driver holding a live ride cannot leave the "active" state.
  if (current === 'active' && next === 'offline') {
    const liveRide = await ridesRepo.findLiveRideByDriver(identity.id);
    if (liveRide) {
      throw new ConflictError('Finish or hand over the current ride before going offline');
    }
  }

  assertTransition(current, next);

  const updated = await driversRepo.updateStatus(identity.id, next);
  await systemLogs.log({
    actorId: identity.id,
    actorRole: 'driver',
    event: 'driver.status_change',
    entityId: identity.id,
    level: 'info',
    details: { from: current, to: next },
  });

  return {
    driverId: identity.id,
    previousStatus: current,
    status: updated ? updated.status : next,
    fullName: driver.full_name,
    vehicleModel: driver.vehicle_model,
    licensePlate: driver.license_plate,
    lat: driver.current_lat,
    lng: driver.current_lng,
    updatedAt: updated ? updated.updated_at : new Date().toISOString(),
  };
}

/**
 * driver:location_update — called at most every 3 seconds per driver.
 * Order: validate driver -> validate coordinates -> UPDATE PostgreSQL
 * (updated_at is maintained by the DB trigger) -> broadcast to operators.
 */
async function updateLocation(identity, payload) {
  if (identity.role !== 'driver') {
    throw new ValidationError('Only drivers can stream GPS coordinates');
  }
  // Client-supplied driver_id is ignored: the authenticated identity wins.
  const { lat, lng } = validateLocationPayload(payload || {});
  const driverId = assertUuid(identity.id, 'driver id');

  const driver = await driversRepo.findById(driverId);
  if (!driver) throw new NotFoundError('Driver profile not found');
  if (driver.status === 'offline') {
    throw new ConflictError('Offline drivers cannot stream GPS');
  }

  const updated = await driversRepo.updateLocation(driverId, lat, lng);
  if (!updated) throw new NotFoundError('Driver profile not found');

  // The rider tracking the assigned ride also needs to follow the car.
  const liveRide = await ridesRepo.findLiveRideByDriver(driverId);

  return {
    driverId,
    lat: Number(updated.current_lat),
    lng: Number(updated.current_lng),
    status: driver.status,
    rideId: liveRide ? liveRide.id : null,
    updatedAt: updated.updated_at,
  };
}

/** Live snapshot used by the operator dashboard and the admin monitor. */
async function snapshotForOperators() {
  const [online, rides, stale] = await Promise.all([
    driversRepo.listByStatuses(['online', 'active']),
    ridesRepo.listByStatuses(['pending', 'assigned', 'in_progress']),
    driversRepo.findStaleActiveDrivers(),
  ]);
  return { drivers: online, rides, stale: stale.map((s) => s.driver_id) };
}

async function getDriver(identity, driverId) {
  const target = driverId ? assertUuid(driverId, 'driver id') : identity.id;
  if (identity.role !== 'admin' && identity.role !== 'operator' && identity.id !== target) {
    throw new ValidationError('Drivers can only read their own profile');
  }
  const driver = await driversRepo.findById(target);
  if (!driver) throw new NotFoundError('Driver not found');
  return driver;
}

async function listDrivers() {
  return driversRepo.listAll();
}

async function ensureDriverProfile(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  if (user.role !== 'driver') throw new ValidationError('User is not a driver');
  const profile = await driversRepo.findById(userId);
  if (!profile) throw new NotFoundError('Driver profile missing');
  return profile;
}

module.exports = {
  changeStatus,
  updateLocation,
  snapshotForOperators,
  getDriver,
  listDrivers,
  ensureDriverProfile,
  TRANSITIONS,
};
