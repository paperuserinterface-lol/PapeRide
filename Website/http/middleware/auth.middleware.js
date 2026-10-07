'use strict';

/**
 * TBRide :: HTTP auth middleware (JWT bearer).
 * Mirrors the Socket.IO handshake guard so both transports share one identity
 * model. Swapping the token implementation later only touches utils/token.js.
 */

const tokenService = require('../../utils/token');
const { AuthError, ForbiddenError } = require('../../utils/errors');
const usersRepo = require('../../repositories/users.repository');

/** Parse + verify the bearer token and attach `req.identity`. */
async function authenticate(req, _res, next) {
  try {
    const raw = tokenService.extractFromRequest(req);
    const claims = tokenService.verify(raw);
    const user = await usersRepo.findById(claims.sub);
    if (!user || user.role !== claims.role) {
      throw new AuthError('Account no longer exists or its role has changed');
    }
    req.identity = { id: user.id, role: user.role, name: user.full_name };
    req.user = user;
    req.tokenClaims = claims;
    return next();
  } catch (err) {
    return next(new AuthError(err && err.expose !== false ? err.message : 'Authentication required'));
  }
}

/** Attach identity when a token is present, otherwise continue anonymously. */
async function optionalAuth(req, _res, next) {
  try {
    const raw = tokenService.extractFromRequest(req);
    if (raw) {
      const claims = tokenService.verify(raw);
      req.identity = { id: claims.sub, role: claims.role, name: claims.name || null };
    }
  } catch (_) {
    req.identity = null; // invalid token on a public route is not fatal
  }
  return next();
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.identity) return next(new AuthError());
    if (!roles.includes(req.identity.role)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };
}

/** Re-read the account from PostgreSQL so revoked/changed roles cannot act. */
async function requireFreshIdentity(req, _res, next) {
  try {
    if (!req.identity) return next(new AuthError());
    const user = await usersRepo.findById(req.identity.id);
    if (!user) return next(new AuthError('Account no longer exists'));
    if (user.role !== req.identity.role) return next(new AuthError('Token role no longer valid'));
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { authenticate, optionalAuth, requireRole, requireFreshIdentity };
