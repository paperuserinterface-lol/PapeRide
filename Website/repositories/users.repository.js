'use strict';

/**
 * TBRide :: users repository (riders, drivers, operators, admins).
 * Every function that can run inside an existing transaction accepts an
 * optional `client` so callers can share row locks.
 */

const { query, queryOne, queryMany, queryOnClient } = require('../db');
const { assertUuid, assertOneOf, ROLES } = require('../utils/validation');

const SELECT_FIELDS = `
    u.id,
    u.full_name,
    u.phone_number,
    u.role,
    u.created_at,
    dp.vehicle_model,
    dp.license_plate,
    dp.status       AS driver_status,
    dp.current_lat  AS driver_lat,
    dp.current_lng  AS driver_lng,
    dp.updated_at   AS driver_updated_at
`;

const SELECT_SQL = `
    SELECT ${SELECT_FIELDS}
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.driver_id = u.id
`;

function normaliseRole(role) {
  return assertOneOf(role, ROLES, 'role');
}

async function findById(id, client = null) {
  const uuid = assertUuid(id, 'user id');
  if (client) {
    const result = await queryOnClient(client, `${SELECT_SQL} WHERE u.id = $1`, [uuid]);
    return result.rows[0] || null;
  }
  return queryOne(`${SELECT_SQL} WHERE u.id = $1`, [uuid]);
}

/** Lock the user row for the duration of a transaction. */
async function lockById(id, client) {
  const uuid = assertUuid(id, 'user id');
  const result = await queryOnClient(
    client,
    `SELECT u.id, u.role
       FROM users u
      WHERE u.id = $1
      FOR UPDATE`,
    [uuid]
  );
  return result.rows[0] || null;
}

async function findByPhone(phoneNumber) {
  const phone = String(phoneNumber || '').trim();
  return queryOne(`${SELECT_SQL} WHERE u.phone_number = $1`, [phone]);
}

async function findCredentialsByPhone(phoneNumber) {
  const phone = String(phoneNumber || '').trim();
  return queryOne(
    `SELECT u.id, u.full_name, u.phone_number, u.role, u.password_hash,
            dp.vehicle_model, dp.license_plate, dp.status AS driver_status,
            dp.current_lat AS driver_lat, dp.current_lng AS driver_lng
       FROM users u
       LEFT JOIN driver_profiles dp ON dp.driver_id = u.id
      WHERE u.phone_number = $1`,
    [phone]
  );
}

async function listByRole(role) {
  const safeRole = normaliseRole(role);
  return queryMany(`${SELECT_SQL} WHERE u.role = $1 ORDER BY u.created_at DESC`, [safeRole]);
}

async function listAll() {
  return queryMany(`${SELECT_SQL} ORDER BY u.created_at DESC`);
}

/**
 * Create a user, plus the driver profile when role = 'driver'.
 * Runs atomically so a driver row can never exist without its profile.
 */
async function create({ fullName, phoneNumber, role, passwordHash, vehicleModel = null, licensePlate = null }) {
  const safeRole = normaliseRole(role);
  const { transaction } = require('../db');
  return transaction(async (client) => {
    const inserted = await queryOnClient(
      client,
      `INSERT INTO users (full_name, phone_number, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, phone_number, role, created_at`,
      [fullName, phoneNumber, safeRole, passwordHash]
    );
    const user = inserted.rows[0];

    if (safeRole === 'driver') {
      await queryOnClient(
        client,
        `INSERT INTO driver_profiles (driver_id, vehicle_model, license_plate, status)
         VALUES ($1, $2, $3, 'offline')`,
        [user.id, vehicleModel, licensePlate]
      );
    }
    return findById(user.id, client);
  });
}

async function update(id, { fullName = null, phoneNumber = null, passwordHash = null } = {}) {
  const uuid = assertUuid(id, 'user id');
  return queryOne(
    `UPDATE users
        SET full_name     = COALESCE($2, full_name),
            phone_number  = COALESCE($3, phone_number),
            password_hash = COALESCE($4, password_hash)
      WHERE id = $1
      RETURNING id, full_name, phone_number, role, created_at`,
    [uuid, fullName, phoneNumber, passwordHash]
  );
}

async function remove(id) {
  const uuid = assertUuid(id, 'user id');
  return queryOne(`DELETE FROM users WHERE id = $1 RETURNING id`, [uuid]);
}

async function countByRole() {
  return queryMany(
    `SELECT role, COUNT(*)::int AS total FROM users GROUP BY role ORDER BY role`
  );
}

module.exports = {
  findById,
  lockById,
  findByPhone,
  findCredentialsByPhone,
  listByRole,
  listAll,
  create,
  update,
  remove,
  countByRole,
};
