'use strict';

/**
 * TBRide :: database module.
 *
 * Wraps a single pg.Pool for the whole process and exposes:
 *   - query(text, params)      -> parameterised query helper
 *   - queryOne / queryMany     -> convenience wrappers
 *   - transaction(handler)     -> BEGIN / COMMIT / ROLLBACK with a scoped client
 *   - verifyConnection()       -> boot-time connectivity check
 *   - closePool()              -> graceful shutdown
 *
 * Every call site MUST use parameterised SQL ($1, $2, ...).
 */

const { Pool } = require('pg');
const config = require('./config');
const logger = require('./utils/logger');

const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  statement_timeout: config.db.statementTimeoutMs,
  application_name: 'tbride-backend',
});

/** The pool itself errored while an idle client was connected. */
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

/**
 * Run a parameterised statement.
 * @param {string} text SQL text with $n placeholders
 * @param {Array=} params bound values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await pool.query(text, params);
    if (config.log.level === 'debug') {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.debug('SQL executed', { ms: ms.toFixed(1), sql: text });
    }
    return result;
  } catch (err) {
    logger.error('SQL failed', {
      error: err.message,
      code: err.code,
      sql: text,
    });
    throw translatePgError(err);
  }
}

/** @returns {Promise<object|null>} first row or null */
async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/** @returns {Promise<Array<object>>} all rows */
async function queryMany(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Execute `handler(client)` inside a transaction.
 * The client is always released; ROLLBACK runs on any thrown error.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} handler
 * @returns {Promise<T>}
 */
async function transaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const outcome = await handler(client);
    await client.query('COMMIT');
    return outcome;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('ROLLBACK failed', { error: rollbackErr.message });
    }
    throw translatePgError(err);
  } finally {
    // Always release: never leak a pooled connection.
    client.release();
  }
}

/**
 * Run a parameterised statement on an existing transaction client.
 * Used by services that already hold a locked row.
 */
async function queryOnClient(client, text, params = []) {
  try {
    return await client.query(text, params);
  } catch (err) {
    logger.error('SQL failed (inside transaction)', {
      error: err.message,
      code: err.code,
      sql: text,
    });
    throw translatePgError(err);
  }
}

/** Map PostgreSQL error codes onto safe, user-facing messages. */
function translatePgError(err) {
  if (!err || err.code === undefined) return err;

  switch (err.code) {
    case '23505': // unique_violation
      return new DbConflictError(err);
    case '23503': // foreign_key_violation
      return new DbRelationError(err);
    case '23514': // check_violation
      return new DbConstraintError(err);
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return new DbConflictError(err);
    case '23502': // not_null_violation
      return new DbConstraintError(err);
    default:
      return err;
  }
}

class DbConflictError extends Error {
  constructor(pgErr) {
    super('Concurrent update detected, please retry.');
    this.name = 'DbConflictError';
    this.statusCode = 409;
    this.code = 'CONFLICT';
    this.expose = true;
    this.pgCode = pgErr && pgErr.code;
  }
}

class DbConstraintError extends Error {
  constructor() {
    super('Request violates a database constraint.');
    this.name = 'DbConstraintError';
    this.statusCode = 400;
    this.code = 'DB_CONSTRAINT';
    this.expose = true;
  }
}

class DbRelationError extends Error {
  constructor() {
    super('Referenced record does not exist.');
    this.name = 'DbRelationError';
    this.statusCode = 400;
    this.code = 'DB_RELATION';
    this.expose = true;
  }
}

/** Boot-time connectivity verification. */
async function verifyConnection() {
  const result = await pool.query(
    'SELECT current_database() AS db, version() AS version, now() AS now'
  );
  return result.rows[0];
}

async function closePool() {
  try {
    await pool.end();
    logger.info('PostgreSQL pool closed');
  } catch (err) {
    logger.error('Error while closing PostgreSQL pool', { error: err.message });
  }
}

module.exports = {
  pool,
  query,
  queryOne,
  queryMany,
  queryOnClient,
  transaction,
  verifyConnection,
  closePool,
  DbConflictError,
  DbConstraintError,
  DbRelationError,
};
