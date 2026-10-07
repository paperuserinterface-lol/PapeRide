'use strict';

/**
 * TBRide :: rider socket handlers.
 *
 *   user:request_ride   -> creates a pending ride + notifies the dispatch floor
 *   user:cancel_ride    -> pending/assigned -> cancelled (owner only)
 */

const ridesService = require('../../services/rides.service');
const events = require('../ride.events');
const { ROOMS, EVENTS } = require('../rooms');
const io = require('../io');

module.exports = function registerUserHandlers(socket, { register }) {
  const identity = () => socket.data.identity;

  register(socket, EVENTS.USER_REQUEST_RIDE, async (payload) => {
    const result = await ridesService.createRide(identity(), payload);
    const ride = result.ride;

    // Keep the rider's socket attached to this ride's room.
    socket.join(ROOMS.ride(ride.id));

    events.emitRideCreated(ride);
    events.emitNewRideRequest(ride);
    return { ride: events.serialiseRide(ride), quote: result.quote };
  });

  register(socket, EVENTS.USER_CANCEL_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const reason = payload && payload.reason;
    const result = await ridesService.cancelRide(identity(), rideId, reason);
    const ride = result.ride;

    events.emitRideStatusUpdate({
      ride,
      previousStatus: result.releasedDriverId || ride.status === 'cancelled' ? 'assigned' : 'pending',
      stage: 'cancelled_by_rider',
      actor: { id: identity().id, role: 'user', name: identity().name },
    });
    events.emitRideRemovedFromBoard(ride.id, 'cancelled');
    if (result.releasedDriverId) events.emitRideWithdrawn(ride.id, result.releasedDriverId, 'cancelled_by_rider');
    return { ride: events.serialiseRide(ride) };
  });
};
