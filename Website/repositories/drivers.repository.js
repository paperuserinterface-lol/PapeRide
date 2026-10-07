'use strict';

/**
 * TBRide :: driver profile repository.
 */

const { query, queryOne, queryMany, queryOnClient } = require('../db');
const { assertUuid, assertOneOf, DRIVER_STATUSES } = require('../utils/validation');

const DRIVER_SELECT = `
    u.id            AS driver_id,
    u.full_name,
    u.phone_number,
    u.role,
    dp.vehicle_model,
    dp.license_plate,
    dp.status,
    dp.current_lat,
    dp.current_lng,
    dp.updated_at
`;

/** Lock a driver row (FOR UPDATE) inside a transaction. */
async function lockById(driverId, client) {
  const uuid = assertUuid(driverId, 'driver id');
  const result = await queryOnClient(
    client,
    `SELECT ${DRIVER_SELECT}
       FROM users u
       JOIN driver_profiles dp ON dp.driver_id = u.id
      WHERE u.id = $1
      FOR UPDATE OF dp`,
    [uuid]
  );
  return result.rows[0] || null;
}

async function findById(driverId, client = null) {
  const uuid = assertUuid(driverId, 'driver id');
  if (client) {
    const result = await queryOnClient(
      client,
      `SELECT ${DRIVER_SELECT}
         FROM users u
         JOIN driver_profiles dp ON dp.driver_id = u.id
        WHERE u.id = $1`,
      [uuid]
    );
    return result.rows[0] || null;
  }
  return queryOne(
    `SELECT ${DRIVER_SELECT}
       FROM users u
       JOIN driver_profiles dp ON dp.driver_id = u.id
      WHERE u.id = $1`,
    [uuid]
  );
}

/** All drivers whose profile status is in `statuses`. */
async function listByStatuses(statuses) {
  const safe = (Array.isArray(statuses) && statuses.length ? statuses : DRIVER_STATUSES)
    .filter((s) => DRIVER_STATUSES.includes(s));
  return queryMany(
    `SELECT ${DRIVER_SELECT}
       FROM users u
       JOIN driver_profiles dp ON dp.driver_id = u.id
      WHERE u.role = 'driver'
        AND dp.status = ANY($1::varchar[])
      ORDER BY dp.updated_at DESC`,
    [safe]
  );
}

async function listAll() {
  return queryMany(
    `SELECT ${DRIVER_SELECT}
       FROM users u
       JOIN driver_profiles dp ON dp.driver_id = u.id
      WHERE u.role = 'driver'
      ORDER BY dp.status, dp.updated_at DESC`
  );
}

/** Position + timestamp update coming from the 3s GPS stream. */
async function updateLocation(driverId, lat, lng) {
  const uuid = assertUuid(driverId, 'driver id');
  return queryOne(
    `UPDATE driver_profiles
        SET current_lat = $2,
            current_lng = $3,
            updated_at  = now()
      WHERE driver_id = $1
      RETURNING driver_id, current_lat, current_lng, updated_at`,
    [uuid, lat, lng]
  );
}

async function updateStatus(driverId, status, client = null) {
  const uuid = assertUuid(driverId, 'driver id');
  const safeStatus = assertOneOf(status, DRIVER_STATUSES, 'driver status');
  if (client) {
    const result = await queryOnClient(
      client,
      `UPDATE driver_profiles
          SET status = $2,
              updated_at = now()
        WHERE driver_id = $1
        RETURNING driver_id, status, updated_at`,
      [uuid, safeStatus]
    );
    return result.rows[0] || null;
  }
  return queryOne(
    `UPDATE driver_profiles
        SET status = $2,
            updated_at = now()
      WHERE driver_id = $1
      RETURNING driver_id, status, updated_at`,
    [uuid, safeStatus]
  );
}

/** Drivers with a live ride attached (status active but no live ride = stale). */
async function findStaleActiveDrivers() {
  return queryMany(
    `SELECT dp.driver_id
       FROM driver_profiles dp
      WHERE dp.status = 'active'
        AND NOT EXISTS (
            SELECT 1 FROM ride_requests r
             WHERE r.assigned_driver_id = dp.driver_id
               AND r.status IN ('assigned', 'in_progress')
        )`
  );
}

async function countByStatus() {
  return queryMany(
    `SELECT status, COUNT(*)::int AS total
       FROM driver_profiles
      GROUP BY status
      ORDER BY status`
  );
}

module.exports = {
  findById,
  lockById,
  listAll,
  listByStatuses,
  updateLocation,
  updateStatus,
  findStaleActiveDrivers,
  countByStatus,
};
