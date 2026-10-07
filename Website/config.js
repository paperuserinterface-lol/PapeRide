'use strict';

/**
 * TBRide :: central configuration.
 * dotenv is loaded once here; every other module reads from this file only.
 */

require('dotenv').config();

const path = require('path');

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = process.env;
const isProduction = (env.NODE_ENV || 'development') === 'production';
const devJwtSecret = 'super_secret_tbride_key_12345';
const devTelegramToken = 'dev_telegram_internal_token';
const jwtSecret = env.JWT_SECRET || (isProduction ? '' : devJwtSecret);
const telegramInternalToken = env.TELEGRAM_INTERNAL_TOKEN || (isProduction ? '' : devTelegramToken);

if (isProduction && (!jwtSecret || jwtSecret.length < 32 ||
    jwtSecret === devJwtSecret || jwtSecret.startsWith('replace-with-'))) {
  throw new Error('Production requires a unique JWT_SECRET with at least 32 characters');
}
if (isProduction && (!telegramInternalToken || telegramInternalToken.length < 32 ||
    telegramInternalToken === devTelegramToken || telegramInternalToken.startsWith('replace-with-'))) {
  throw new Error('Production requires a unique TELEGRAM_INTERNAL_TOKEN with at least 32 characters');
}
if (isProduction && !env.DATABASE_URL) {
  throw new Error('Production requires DATABASE_URL');
}

const config = {
  env: env.NODE_ENV || 'development',
  isProduction,

  app: {
    name: 'TBRide',
    port: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    publicDir: path.join(__dirname, '..', 'public'),
  },

  db: {
    connectionString:
      env.DATABASE_URL ||
      'postgres://postgres:1@localhost:5432/tbride_db',
    poolMax: num(env.DB_POOL_MAX, 10),
    idleTimeoutMs: num(env.DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMs: num(env.DB_CONNECTION_TIMEOUT_MS, 10000),
    statementTimeoutMs: num(env.DB_STATEMENT_TIMEOUT_MS, 15000),
  },

  auth: {
    // JWT (HS256) signing secret — never hard-code real secrets in source.
    jwtSecret,
    tokenTtlSeconds: num(env.JWT_TTL_SECONDS, 60 * 60 * 12),
    issuer: 'tbride',
    audience: 'tbride-clients',
  },

  socket: {
    pingIntervalMs: num(env.SOCKET_PING_INTERVAL_MS, 20000),
    pingTimeoutMs: num(env.SOCKET_PING_TIMEOUT_MS, 20000),
  },

  ride: {
    // Fare model (UZS) used for the operator/user dashboards.
    baseFare: num(env.RIDE_BASE_FARE, 9000),
    perKm: num(env.RIDE_PER_KM, 2500),
    avgSpeedKmh: num(env.RIDE_AVG_SPEED_KMH, 28),
    maxPickupDistanceKm: num(env.RIDE_MAX_PICKUP_DISTANCE_KM, 25),
  },

  cors: {
    // Comma separated list, "*" allows every origin (development default).
    origins: (env.CORS_ORIGINS || (isProduction ? env.RENDER_EXTERNAL_URL || '' : '*'))
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  telegram: {
    // Shared secret the Telegram bot must send in the X-Telegram-Token header
    // on every /api/telegram/* call. Change this beyond local development.
    internalToken: telegramInternalToken,
  },

  log: {
    level: (env.LOG_LEVEL || 'info').toLowerCase(),
  },
};

module.exports = config;
