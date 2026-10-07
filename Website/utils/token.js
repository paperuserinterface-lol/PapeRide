'use strict';

/**
 * TBRide :: token service.
 *
 * Real JWTs (HS256) built with node:crypto only — no extra dependency.
 * Sign / verify are isolated here so swapping in `jsonwebtoken`, adding refresh
 * tokens or per-role claims later requires no change anywhere else.
 */

const crypto = require('crypto');
const config = require('../config');
const { AuthError } = require('./errors');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8');
}

function sign(payload, overrides = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = {
    sub: payload.sub,
    role: payload.role,
    name: payload.name || null,
    iss: overrides.issuer || config.auth.issuer,
    aud: overrides.audience || config.auth.audience,
    iat: issuedAt,
    exp: issuedAt + (overrides.ttlSeconds || config.auth.tokenTtlSeconds),
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(unsigned)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${signature}`;
}

/**
 * @returns {{sub:string,role:string,name:string|null,iat:number,exp:number}}
 */
function verify(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new AuthError('Missing authentication token');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed authentication token');

  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthError('Invalid token signature');
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encodedPayload));
  } catch (_) {
    throw new AuthError('Malformed token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new AuthError('Token expired');
  if (payload.nbf && payload.nbf > now) throw new AuthError('Token not active yet');
  if (payload.iss && payload.iss !== config.auth.issuer) throw new AuthError('Unknown token issuer');
  if (!payload.sub || !payload.role) throw new AuthError('Token missing identity claims');

  return payload;
}

/** Extract `Authorization: Bearer <token>` or `?token=` style credentials. */
function extractFromRequest(req) {
  const header = req.headers && req.headers.authorization;
  if (header && /^bearer\s+/i.test(header)) {
    return header.replace(/^bearer\s+/i, '').trim();
  }
  if (req.query && typeof req.query.token === 'string') return req.query.token.trim();
  return null;
}

module.exports = { sign, verify, extractFromRequest };
