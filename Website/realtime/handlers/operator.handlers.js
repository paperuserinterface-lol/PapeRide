'use strict';

/**
 * TBRide :: operator socket handlers.
 *
 *   operator:assign_ride        manual drag & drop dispatch (transactional)
 *   operator:auto_assign        nearest online driver
 *   operator:cancel_ride        operator side cancellation
 *   operator:snapshot_request   refresh the dispatch board
 */

const dispatchService = require('../../services/dispatch.service');
const ridesService = require('../../services/rides.service');
const driversService = require('../../services/drivers.service');
const events = require('../ride.events');
const { EVENTS } = require('../rooms');
const { buildSnapshot } = require('../snapshots');

module.exports = function registerOperatorHandlers(socket, { register }) {
  const identity = () => socket.data.identity;

  register(socket, EVENTS.OPERATOR_ASSIGN_RIDE, async (payload) => {
    const result = await dispatchService.assignRideToDriver(identity(), payload);
    const ride = result.ride;

    if (!result.unchanged) {
      events.emitRideStatusUpdate({
        ride,
        previousStatus: result.reassigned ? 'assigned' : 'pending',
        stage: result.reassigned ? 'reassigned' : 'assigned',
        actor: { id: identity().id, role: identity().role, name: identity().name },
      });
      // The driver is notified privately through driver_<driver_id>.
      events.emitDriverRideOffer(ride, ride.assigned_driver_id);
      events.emitDriverStatus({
        driverId: ride.assigned_driver_id,
        status: 'active',
        previousStatus: 'online',
        fullName: ride.driver_name,
        at: new Date().toISOString(),
      });
      if (result.reassigned && result.previousDriverId) {
        events.emitRideWithdrawn(ride.id, result.previousDriverId, 'reassigned');
      }
    }
    return {
      ride: events.serialiseRide(ride),
      reassigned: result.reassigned,
      unchanged: result.unchanged,
    };
  });

  register(socket, EVENTS.OPERATOR_AUTO_ASSIGN, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await dispatchService.autoAssign(identity(), rideId);
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'pending',
      stage: 'assigned',
      actor: { id: identity().id, role: identity().role, name: identity().name },
    });
    events.emitDriverRideOffer(result.ride, result.ride.assigned_driver_id);
    return { ride: events.serialiseRide(result.ride), distanceKm: result.distanceKm };
  });

  register(socket, EVENTS.OPERATOR_CANCEL_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const reason = payload && payload.reason;
    const result = await ridesService.cancelRide(identity(), rideId, reason || 'cancelled_by_operator');
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'assigned',
      stage: 'cancelled_by_operator',
      actor: { id: identity().id, role: identity().role, name: identity().name },
    });
    events.emitRideRemovedFromBoard(result.ride.id, 'cancelled');
    if (result.releasedDriverId) {
      events.emitRideWithdrawn(result.ride.id, result.releasedDriverId, 'cancelled_by_operator');
    }
    return { ride: events.serialiseRide(result.ride) };
  });

  register(socket, EVENTS.OPERATOR_SNAPSHOT_REQUEST, async () => {
    const snapshot = await buildSnapshot(identity());
    return snapshot ? snapshot.payload : {};
  });

  register(socket, 'operator:drivers', async () => {
    const drivers = await driversService.listDrivers();
    return { drivers: drivers.map(events.serialiseDriver) };
  });
};
