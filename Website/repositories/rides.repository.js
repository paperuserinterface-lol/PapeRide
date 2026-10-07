'use strict';

/**
 * TBRide :: ride_requests repository.
 */

const { query, queryOne, queryMany, queryOnClient } = require('../db');
const { assertUuid } = require('../utils/validation');

const RIDE_SELECT = `
    r.id,
    r.user_id,
    r.pickup_lat,
    r.pickup_lng,
    r.dropoff_lat,
    r.dropoff_lng,
    r.pickup_label,
    r.dropoff_label,
    r.assigned_driver_id,
    r.operator_id,
    r.status,
    r.created_at,
    r.updated_at,
    ru.full_name  AS rider_name,
    ru.phone_number AS rider_phone,
    du.full_name  AS driver_name,
    du.phone_number AS driver_phone,
    dp.vehicle_model,
    dp.license_plate,
    dp.status     AS driver_status,
    dp.current_lat  AS driver_lat,
    dp.current_lng  AS driver_lng,
    ou.full_name  AS operator_name
`;

const RIDE_JOINS = `
    FROM ride_requests r
    JOIN users ru        ON ru.id = r.user_id
    LEFT JOIN users du   ON du.id = r.assigned_driver_id
    LEFT JOIN driver_profiles dp ON dp.driver_id = r.assigned_driver_id
    LEFT JOIN users ou   ON ou.id = r.operator_id
`;

/** LIVE_STATUSES are the only states that hold a driver/rider slot. */
const LIVE_STATUSES = ['pending', 'assigned', 'in_progress'];

async function findById(id, client = null) {
  const uuid = assertUuid(id, 'ride id');
  if (client) {
    const result = await queryOnClient(client, `SELECT ${RIDE_SELECT} ${RIDE_JOINS} WHERE r.id = $1`, [uuid]);
    return result.rows[0] || null;
  }
  return queryOne(`SELECT ${RIDE_SELECT} ${RIDE_JOINS} WHERE r.id = $1`, [uuid]);
}

/** SELECT ... FOR UPDATE on the ride row — the core dispatch lock. */
async function lockById(id, client) {
  const uuid = assertUuid(id, 'ride id');
  const result = await queryOnClient(
    client,
    `SELECT r.id, r.user_id, r.assigned_driver_id, r.operator_id, r.status,
            r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng
       FROM ride_requests r
      WHERE r.id = $1
      FOR UPDATE`,
    [uuid]
  );
  return result.rows[0] || null;
}

async function insert({ userId, pickupLat, pickupLng, dropoffLat, dropoffLng, pickupLabel = null, dropoffLabel = null }, client = null) {
  const params = [userId, pickupLat, pickupLng, dropoffLat, dropoffLng, pickupLabel, dropoffLabel];
  const sql = `
      INSERT INTO ride_requests
          (user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
           pickup_label, dropoff_label, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING id, user_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
                pickup_label, dropoff_label,
                assigned_driver_id, operator_id, status, created_at, updated_at`;

  if (client) {
    const result = await queryOnClient(client, sql, params);
    return result.rows[0];
  }
  return queryOne(sql, params);
}

async function setStatus(id, status, { assignedDriverId = undefined, operatorId = undefined } = {}, client = null) {
  const uuid = assertUuid(id, 'ride id');
  const sets = ['status = $2'];
  const params = [uuid, status];
  let idx = 3;

  if (assignedDriverId !== undefined) {
    sets.push(`assigned_driver_id = $${idx}`);
    params.push(assignedDriverId);
    idx += 1;
  }
  if (operatorId !== undefined) {
    sets.push(`operator_id = $${idx}`);
    params.push(operatorId);
    idx += 1;
  }

  const sql = `UPDATE ride_requests SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, user_id, assigned_driver_id, operator_id, status, created_at, updated_at`;

  if (client) {
    const result = await queryOnClient(client, sql, params);
    return result.rows[0] || null;
  }
  return queryOne(sql, params);
}

async function listByStatuses(statuses, { limit = 100 } = {}) {
  const safe = (Array.isArray(statuses) ? statuses : []).filter((s) =>
    ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'].includes(s)
  );
  const where = safe.length ? 'WHERE r.status = ANY($1::varchar[])' : '';
  return queryMany(
    `SELECT ${RIDE_SELECT} ${RIDE_JOINS} ${where}
      ORDER BY r.created_at DESC
      LIMIT ${Math.max(1, Math.min(Number(limit) || 100, 500))}`,
    where ? [safe] : []
  );
}

async function listByUser(userId, { limit = 25 } = {}) {
  const uuid = assertUuid(userId, 'user id');
  return queryMany(
    `SELECT ${RIDE_SELECT} ${RIDE_JOINS}
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      LIMIT ${Math.max(1, Math.min(Number(limit) || 25, 200))}`,
    [uuid]
  );
}

async function listByDriver(driverId, { limit = 25 } = {}) {
  const uuid = assertUuid(driverId, 'driver id');
  return queryMany(
    `SELECT ${RIDE_SELECT} ${RIDE_JOINS}
      WHERE r.assigned_driver_id = $1
      ORDER BY r.created_at DESC
      LIMIT ${Math.max(1, Math.min(Number(limit) || 25, 200))}`,
    [uuid]
  );
}

/** The single live ride of a driver (pending should never be assigned, but stay defensive). */
async function findLiveRideByDriver(driverId, client = null) {
  const uuid = assertUuid(driverId, 'driver id');
  const sql = `SELECT ${RIDE_SELECT} ${RIDE_JOINS}
      WHERE r.assigned_driver_id = $1 AND r.status = ANY($2::varchar[])
      LIMIT 1`;
  const params = [uuid, ['assigned', 'in_progress']];
  if (client) {
    const result = await queryOnClient(client, sql, params);
    return result.rows[0] || null;
  }
  return queryOne(sql, params);
}

/** The single ride a rider currently has being served (assigned / in_progress). */
async function findActiveRideByUser(userId, client = null) {
  const uuid = assertUuid(userId, 'user id');
  const sql = `SELECT ${RIDE_SELECT} ${RIDE_JOINS}
      WHERE r.user_id = $1 AND r.status = ANY($2::varchar[])
      LIMIT 1`;
  const params = [uuid, ['assigned', 'in_progress']];
  if (client) {
    const result = await queryOnClient(client, sql, params);
    return result.rows[0] || null;
  }
  return queryOne(sql, params);
}

async function findLiveRideByUser(userId) {
  const uuid = assertUuid(userId, 'user id');
  return queryOne(
    `SELECT ${RIDE_SELECT} ${RIDE_JOINS}
      WHERE r.user_id = $1 AND r.status = ANY($2::varchar[])
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [uuid, LIVE_STATUSES]
  );
}

async function countByStatus() {
  return queryMany(
    `SELECT status, COUNT(*)::int AS total FROM ride_requests GROUP BY status ORDER BY status`
  );
}

module.exports = {
  LIVE_STATUSES,
  findById,
  lockById,
  insert,
  setStatus,
  listByStatuses,
  listByUser,
  listByDriver,
  findLiveRideByDriver,
  findLiveRideByUser,
  findActiveRideByUser,
  countByStatus,
};
