'use strict';

require('dotenv').config();

const { closePool, transaction } = require('../db');
const { hashPassword } = require('../utils/password');
const { assertFullName, assertPassword, assertPhoneNumber } = require('../utils/validation');

async function main() {
  const missing = ['ADMIN_FULL_NAME', 'ADMIN_PHONE_NUMBER', 'ADMIN_PASSWORD']
    .filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Set these environment variables first: ${missing.join(', ')}`);
  }
  const fullName = assertFullName(process.env.ADMIN_FULL_NAME);
  const phoneNumber = assertPhoneNumber(process.env.ADMIN_PHONE_NUMBER);
  const passwordHash = await hashPassword(assertPassword(process.env.ADMIN_PASSWORD));

  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('tbride:first-admin-bootstrap'))");
    const admins = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.rowCount > 0) {
      throw new Error('An administrator already exists; refusing to create another bootstrap admin');
    }
    await client.query(
      `INSERT INTO users (full_name, phone_number, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      [fullName, phoneNumber, passwordHash]
    );
  });

  console.log(`Initial administrator created for ${phoneNumber}.`);
}

main()
  .catch((err) => {
    console.error(`Could not create initial administrator: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
