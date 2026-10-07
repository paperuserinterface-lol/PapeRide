'use strict';

/**
 * TBRide :: driver socket handlers.
 *
 *   driver:location_update   GPS stream (every 3s in the simulator)
 *   driver:status_change     offline / online
 *   driver:accept_ride       self-dispatch of a pending ride
 *   driver:decline_ride      informational
 *   driver:arrived           marks arrival at the pickup point
 *   driver:start_ride        assigned -> in_progress
 *   driver:complete_ride     in_progress -> completed (driver -> online)
 */

const ridesService = require('../../services/rides.service');
const driversService = require('../../services/drivers.service');
const events = require('../ride.events');
const { EVENTS } = require('../rooms');

module.exports = function registerDriverHandlers(socket, { register }) {
  const identity = () => socket.data.identity;

  register(socket, EVENTS.DRIVER_LOCATION_UPDATE, async (payload) => {
    const location = await driversService.updateLocation(identity(), payload);
    // `driver:location` goes ONLY to operators_room.
    events.emitDriverLocation(location);
    // Supplementary feed: the rider inside ride_<rideId> follows the car too.
    if (location.rideId) {
      const io = require('../io');
      io.toRideRoom(location.rideId, EVENTS.RIDE_DRIVER_LOCATION, {
        driverId: location.driverId,
        rideId: location.rideId,
        lat: location.lat,
        lng: location.lng,
        updatedAt: location.updatedAt,
      });
    }
    return location;
  });

  register(socket, EVENTS.DRIVER_STATUS_CHANGE, async (payload) => {
    const result = await driversService.changeStatus(identity(), payload && payload.status);
    events.emitDriverStatus({
      driverId: result.driverId,
      status: result.status,
      previousStatus: result.previousStatus,
      fullName: result.fullName,
      vehicleModel: result.vehicleModel,
      licensePlate: result.licensePlate,
      location: result.lat !== null && result.lat !== undefined ? { lat: Number(result.lat), lng: Number(result.lng) } : null,
      at: result.updatedAt,
    });
    const profile = await driversService.getDriver(identity(), identity().id);
    return { ...result, profile };
  });

  register(socket, EVENTS.DRIVER_ACCEPT_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await ridesService.acceptRide(identity(), rideId);
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'pending',
      stage: 'accepted',
      actor: { id: identity().id, role: 'driver', name: identity().name },
    });
    events.emitDriverRideOffer(result.ride, identity().id);
    events.emitDriverStatus({
      driverId: identity().id,
      status: 'active',
      previousStatus: 'online',
      fullName: identity().name,
      at: new Date().toISOString(),
    });
    return { ride: events.serialiseRide(result.ride) };
  });

  register(socket, EVENTS.DRIVER_DECLINE_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await ridesService.declineRide(identity(), rideId, payload && payload.reason);
    events.emitRideStatusUpdate({
      ride: await ridesService.getRide(identity(), rideId),
      previousStatus: 'assigned',
      stage: 'declined',
      actor: { id: identity().id, role: 'driver', name: identity().name },
    });
    return result;
  });

  register(socket, EVENTS.DRIVER_ARRIVED, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await ridesService.markArrived(identity(), rideId);
    const ride = await ridesService.getRide(identity(), rideId);
    events.emitRideStatusUpdate({
      ride,
      previousStatus: 'assigned',
      stage: result.stage,
      actor: { id: identity().id, role: 'driver', name: identity().name },
    });
    return result;
  });

  register(socket, EVENTS.DRIVER_START_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await ridesService.startRide(identity(), rideId);
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'assigned',
      stage: 'started',
      actor: { id: identity().id, role: 'driver', name: identity().name },
    });
    return { ride: events.serialiseRide(result.ride) };
  });

  register(socket, EVENTS.DRIVER_COMPLETE_RIDE, async (payload) => {
    const rideId = payload && (payload.ride_id || payload.rideId);
    const result = await ridesService.completeRide(identity(), rideId);
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'in_progress',
      stage: 'completed',
      actor: { id: identity().id, role: 'driver', name: identity().name },
    });
    events.emitDriverStatus({
      driverId: identity().id,
      status: (result.driver && result.driver.status) || 'online',
      previousStatus: 'active',
      fullName: result.driver ? result.driver.full_name : identity().name,
      location: result.driver && result.driver.current_lat !== null
        ? { lat: Number(result.driver.current_lat), lng: Number(result.driver.current_lng) }
        : null,
      at: new Date().toISOString(),
    });
    return { ride: events.serialiseRide(result.ride) };
  });
};
