'use strict';

/**
 * TBRide :: outbound realtime events.
 * PostgreSQL is the source of truth — these helpers only synchronise clients.
 */

const io = require('./io');
const { EVENTS } = require('./rooms');
const { serialiseRide, serialiseDriver } = require('./snapshots');
const logger = require('../utils/logger');

/** ride:created -> rider, ride room */
function emitRideCreated(ride) {
  const payload = { ride: serialiseRide(ride), at: new Date().toISOString() };
  io.toUser(ride.user_id, EVENTS.RIDE_CREATED, payload);
  io.toRideRoom(ride.id, EVENTS.RIDE_CREATED, payload);
}

/** ride:new_request -> operators_room, ride:available -> drivers_room */
function emitNewRideRequest(ride) {
  const payload = { ride: serialiseRide(ride), at: new Date().toISOString() };
  io.toOperators(EVENTS.RIDE_NEW_REQUEST, payload);
  io.toDrivers(EVENTS.RIDE_AVAILABLE, payload);
}

/**
 * ride:status_update -> ride_<id>, user_<id>, driver_<id>, operators_room,
 * drivers_room.
 */
function emitRideStatusUpdate({ ride, previousStatus = null, stage = null, actor = null }) {
  const payload = {
    ride: serialiseRide(ride),
    rideId: ride.id,
    status: ride.status,
    previousStatus,
    stage,
    actor,
    at: new Date().toISOString(),
  };
  io.toRideRoom(ride.id, EVENTS.RIDE_STATUS_UPDATE, payload);
  if (ride.user_id) io.toUser(ride.user_id, EVENTS.RIDE_STATUS_UPDATE, payload);
  if (ride.assigned_driver_id) io.toDriver(ride.assigned_driver_id, EVENTS.RIDE_STATUS_UPDATE, payload);
  io.toOperators(EVENTS.RIDE_STATUS_UPDATE, payload);
  io.toDrivers(EVENTS.RIDE_STATUS_UPDATE, payload);
  logger.debug('ride:status_update broadcast', { rideId: ride.id, status: ride.status, stage });
}

/** driver:ride_offer -> driver_<driver_id> */
function emitDriverRideOffer(ride, driverId) {
  io.toDriver(driverId, EVENTS.DRIVER_RIDE_OFFER, {
    ride: serialiseRide(ride),
    rideId: ride.id,
    at: new Date().toISOString(),
  });
}

/** Tell a driver their offer disappeared (cancelled / re-assigned). */
function emitRideWithdrawn(rideId, driverId, reason) {
  if (!driverId) return;
  io.toDriver(driverId, EVENTS.RIDE_REMOVED, { rideId, reason, at: new Date().toISOString() });
}

/** driver:location -> operators_room ONLY. */
function emitDriverLocation(location) {
  io.toOperators(EVENTS.DRIVER_LOCATION, location);
}

/** driver:status -> operators_room + drivers_room */
function emitDriverStatus(statusPayload) {
  io.toOperators(EVENTS.DRIVER_STATUS, statusPayload);
  io.toDrivers(EVENTS.DRIVER_STATUS, statusPayload);
}

/** Ride disappeared from the dispatch board. */
function emitRideRemovedFromBoard(rideId, reason) {
  io.toOperators(EVENTS.RIDE_REMOVED, { rideId, reason, at: new Date().toISOString() });
  io.toDrivers(EVENTS.RIDE_REMOVED, { rideId, reason, at: new Date().toISOString() });
}

module.exports = {
  emitRideCreated,
  emitNewRideRequest,
  emitRideStatusUpdate,
  emitDriverRideOffer,
  emitRideWithdrawn,
  emitDriverLocation,
  emitDriverStatus,
  emitRideRemovedFromBoard,
  serialiseRide,
  serialiseDriver,
};
