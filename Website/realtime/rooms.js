'use strict';

/**
 * TBRide :: room naming + event name constants (single source of truth).
 */

const ROOMS = {
  OPERATORS: 'operators_room',
  DRIVERS: 'drivers_room',
  user: (id) => `user_${id}`,
  driver: (id) => `driver_${id}`,
  ride: (id) => `ride_${id}`,
};

const EVENTS = {
  // ---- driver -> server ----
  DRIVER_LOCATION_UPDATE: 'driver:location_update',
  DRIVER_STATUS_CHANGE: 'driver:status_change',
  DRIVER_ACCEPT_RIDE: 'driver:accept_ride',
  DRIVER_DECLINE_RIDE: 'driver:decline_ride',
  DRIVER_ARRIVED: 'driver:arrived',
  DRIVER_START_RIDE: 'driver:start_ride',
  DRIVER_COMPLETE_RIDE: 'driver:complete_ride',

  // ---- user -> server ----
  USER_REQUEST_RIDE: 'user:request_ride',
  USER_CANCEL_RIDE: 'user:cancel_ride',

  // ---- operator -> server ----
  OPERATOR_ASSIGN_RIDE: 'operator:assign_ride',

  // ---- server -> clients ----
  RIDE_NEW_REQUEST: 'ride:new_request',
  RIDE_CREATED: 'ride:created',
  RIDE_STATUS_UPDATE: 'ride:status_update',
  DRIVER_LOCATION: 'driver:location',
  DRIVER_RIDE_OFFER: 'driver:ride_offer',
  SERVER_ERROR: 'server:error',

  // ---- extra (snapshots + auxiliary realtime feeds) ----
  CONNECTION_READY: 'connection:ready',
  USER_SNAPSHOT: 'user:snapshot',
  DRIVER_SNAPSHOT: 'driver:snapshot',
  OPERATOR_SNAPSHOT: 'operator:snapshot',
  ADMIN_SNAPSHOT: 'admin:snapshot',
  RIDE_AVAILABLE: 'ride:available',
  RIDE_DRIVER_LOCATION: 'ride:driver_location',
  RIDE_REMOVED: 'ride:removed',
  DRIVER_STATUS: 'driver:status',
  USER_CANCEL_RIDE_BROADCAST: 'ride:cancelled',
  OPERATOR_AUTO_ASSIGN: 'operator:auto_assign',
  OPERATOR_CANCEL_RIDE: 'operator:cancel_ride',
  OPERATOR_SNAPSHOT_REQUEST: 'operator:snapshot_request',
  RIDE_SUBSCRIBE: 'ride:subscribe',
};

module.exports = { ROOMS, EVENTS };
