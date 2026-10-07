'use strict';

/**
 * TBRide :: operator dispatch service.
 * Thin, authorised wrapper around the transactional ride assignment, plus
 * nearest-driver auto dispatch used by the operator dashboard.
 */

const ridesRepo = require('../repositories/rides.repository');
const driversRepo = require('../repositories/drivers.repository');
const ridesService = require('./rides.service');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');
const { assertUuid, haversineKm } = require('../utils/validation');

/**
 * operator:assign_ride
 * @param {{id:string,role:string,name:string}} identity authenticated operator
 * @param {{ride_id:string,driver_id:string}} payload
 */
async function assignRideToDriver(identity, payload) {
  if (!identity || (identity.role !== 'operator' && identity.role !== 'admin')) {
    throw new ValidationError('Only operators can dispatch rides');
  }
  const body = payload || {};
  const rideId = assertUuid(body.ride_id || body.rideId, 'ride_id');
  const driverId = assertUuid(body.driver_id || body.driverId, 'driver_id');

  const result = await ridesService.assignRide({
    operatorId: identity.id,
    rideId,
    driverId,
    via: 'operator_drag_drop',
  });
  return result;
}

/**
 * Assign a ride to the closest online, idle driver.
 */
async function autoAssign(identity, rideId) {
  if (!identity || (identity.role !== 'operator' && identity.role !== 'admin')) {
    throw new ValidationError('Only operators can dispatch rides');
  }
  const id = assertUuid(rideId, 'ride_id');
  const ride = await ridesRepo.findById(id);
  if (!ride) throw new NotFoundError('Ride not found');
  if (!['pending', 'assigned'].includes(ride.status)) {
    throw new ConflictError(`Ride is ${ride.status} and can no longer be dispatched`);
  }

  const drivers = await driversRepo.listByStatuses(['online']);
  if (!drivers.length) throw new ConflictError('No online drivers available');

  const candidates = drivers
    .filter((d) => d.current_lat !== null && d.current_lng !== null)
    .map((d) => ({
      driver: d,
      distanceKm: haversineKm(
        Number(ride.pickup_lat),
        Number(ride.pickup_lng),
        Number(d.current_lat),
        Number(d.current_lng)
      ),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!candidates.length) {
    throw new ConflictError('Online drivers have no GPS position yet');
  }

  const best = candidates[0];
  const result = await ridesService.assignRide({
    operatorId: identity.id,
    rideId: id,
    driverId: best.driver.driver_id,
    via: 'operator_auto',
  });
  return { ...result, distanceKm: Math.round(best.distanceKm * 100) / 100 };
}

/** Operator dashboard data: pending rides + online drivers + in-progress rides. */
async function dashboardSnapshot() {
  const [pending, live, onlineDrivers] = await Promise.all([
    ridesRepo.listByStatuses(['pending']),
    ridesRepo.listByStatuses(['assigned', 'in_progress']),
    driversRepo.listByStatuses(['online', 'active']),
  ]);
  return { pending, live, drivers: onlineDrivers };
}

module.exports = {
  assignRideToDriver,
  autoAssign,
  dashboardSnapshot,
};
