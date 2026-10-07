'use strict';

/**
 * TBRide :: apply-sql.js
 * Applies a schema or migration .sql file to the database named by
 * DATABASE_URL using the same `pg` dependency as the server.
 *
 *   node scripts/apply-sql.js schema.sql
 *   npm run db:setup
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const file = process.argv[2];

if (!file) {
  console.error('Usage: node scripts/apply-sql.js <file.sql>');
  process.exit(1);
}

const fullPath = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);

if (!fs.existsSync(fullPath)) {
  console.error(`SQL file not found: ${fullPath}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const client = new Client({ connectionString });

client
  .connect()
  .then(async () => {
    const sql = fs.readFileSync(fullPath, 'utf8');
    console.log(`Applying ${fullPath} ...`);
    await client.query(sql);
    console.log('Done.');
  })
  .then(async () => {
    const result = await client.query(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM driver_profiles)::int AS drivers,
              (SELECT COUNT(*) FROM ride_requests)::int AS rides`
    );
    const row = result.rows[0];
    console.log(`users=${row.users} drivers=${row.drivers} rides=${row.rides}`);
    return client.end();
  })
  .catch(async (err) => {
    console.error(`Failed: ${err.message}`);
    try { await client.end(); } catch (_) { /* ignore */ }
    process.exit(1);
  });
