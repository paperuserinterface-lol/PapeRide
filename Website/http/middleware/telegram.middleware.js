'use strict';

/**
 * TBRide :: Telegram bridge auth middleware.
 * The bot authenticates with a shared secret (X-Telegram-Token header)
 * instead of a JWT — it has no user session, it IS the trusted transport
 * for every Telegram rider. Compared in constant time.
 */

const crypto = require('crypto');
const config = require('../../config');
const { AuthError } = require('../../utils/errors');

function requireTelegramToken(req, _res, next) {
  const provided = Buffer.from(String(req.get('x-telegram-token') || ''));
  const expected = Buffer.from(String(config.telegram.internalToken || ''));
  const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!ok) {
    return next(new AuthError('Invalid Telegram token'));
  }
  return next();
}

module.exports = { requireTelegramToken };
