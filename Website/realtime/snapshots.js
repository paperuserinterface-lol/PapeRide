'use strict';

/**
 * TBRide :: initial state pushed to a socket right after connection so the
 * vanilla JS clients render instantly instead of waiting for the next event.
 */

const ridesRepo = require('../repositories/rides.repository');
const driversRepo = require('../repositories/drivers.repository');
const usersRepo = require('../repositories/users.repository');
const systemLogs = require('../repositories/logs.repository');
const ridesService = require('../services/rides.service');
const dispatchService = require('../services/dispatch.service');
const driversService = require('../services/drivers.service');
const { EVENTS } = require('./rooms');

function serialiseRide(ride) {
  if (!ride) return null;
  return {
    id: ride.id,
    userId: ride.user_id,
    riderName: ride.rider_name,
    riderPhone: ride.rider_phone,
    pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) },
    dropoff: { lat: Number(ride.dropoff_lat), lng: Number(ride.dropoff_lng) },
    pickupLabel: ride.pickup_label || null,
    dropoffLabel: ride.dropoff_label || null,
    assignedDriverId: ride.assigned_driver_id,
    operatorId: ride.operator_id,
    operatorName: ride.operator_name,
    driverName: ride.driver_name,
    driverPhone: ride.driver_phone,
    vehicleModel: ride.vehicle_model,
    licensePlate: ride.license_plate,
    driverStatus: ride.driver_status,
    driverLocation:
      ride.driver_lat !== null && ride.driver_lat !== undefined
        ? { lat: Number(ride.driver_lat), lng: Number(ride.driver_lng) }
        : null,
    status: ride.status,
    createdAt: ride.created_at,
    updatedAt: ride.updated_at,
    quote: ridesService.quote(ride, ride),
  };
}

function serialiseDriver(driver) {
  if (!driver) return null;
  return {
    driverId: driver.driver_id || driver.id,
    fullName: driver.full_name,
    phone: driver.phone_number,
    vehicleModel: driver.vehicle_model,
    licensePlate: driver.license_plate,
    status: driver.status,
    location:
      driver.current_lat !== null && driver.current_lat !== undefined
        ? { lat: Number(driver.current_lat), lng: Number(driver.current_lng) }
        : null,
    updatedAt: driver.updated_at,
  };
}

async function buildSnapshot(identity) {
  if (!identity) return null;

  if (identity.role === 'user') {
    const [rides, live] = await Promise.all([
      ridesRepo.listByUser(identity.id, { limit: 10 }),
      ridesRepo.findLiveRideByUser(identity.id),
    ]);
    return {
      event: EVENTS.USER_SNAPSHOT,
      payload: {
        user: { id: identity.id, name: identity.name, role: identity.role },
        rides: rides.map(serialiseRide),
        activeRide: live ? serialiseRide(live) : null,
        at: new Date().toISOString(),
      },
    };
  }

  if (identity.role === 'driver') {
    const profile = await driversRepo.findById(identity.id);
    const [currentRide, history] = await Promise.all([
      ridesRepo.findLiveRideByDriver(identity.id),
      ridesRepo.listByDriver(identity.id, { limit: 5 }),
    ]);
    return {
      event: EVENTS.DRIVER_SNAPSHOT,
      payload: {
        driver: serialiseDriver(profile),
        offer: currentRide ? serialiseRide(currentRide) : null,
        history: history.map(serialiseRide),
        at: new Date().toISOString(),
      },
    };
  }

  if (identity.role === 'operator' || identity.role === 'admin') {
    const dashboard = await dispatchService.dashboardSnapshot();
    return {
      event: EVENTS.OPERATOR_SNAPSHOT,
      payload: {
        pending: dashboard.pending.map(serialiseRide),
        live: dashboard.live.map(serialiseRide),
        drivers: dashboard.drivers.map(serialiseDriver),
        at: new Date().toISOString(),
      },
    };
  }

  return null;
}

async function buildAdminSnapshot() {
  const [users, drivers, rides, logs, userCounts, driverCounts, rideCounts] = await Promise.all([
    usersRepo.listAll(),
    driversRepo.listAll(),
    ridesRepo.listByStatuses([], { limit: 50 }),
    systemLogs.list({ limit: 60 }),
    usersRepo.countByRole(),
    driversRepo.countByStatus(),
    ridesRepo.countByStatus(),
  ]);
  return {
    users,
    drivers: drivers.map(serialiseDriver),
    rides: rides.map(serialiseRide),
    logs,
    stats: { users: userCounts, drivers: driverCounts, rides: rideCounts },
  };
}

module.exports = { buildSnapshot, buildAdminSnapshot, serialiseRide, serialiseDriver, driversService };
