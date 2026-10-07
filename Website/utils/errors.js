'use strict';

/**
 * TBRide :: application error types.
 * Socket and HTTP layers map these onto safe client responses.
 * Internal errors are NEVER forwarded to clients (no SQL leakage).
 */

class AppError extends Error {
  constructor(message, { statusCode = 400, code = 'APP_ERROR', details = null, expose = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 422, code: 'VALIDATION_ERROR', details });
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, { statusCode: 401, code: 'UNAUTHENTICATED' });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to perform this action') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' });
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict with the current state', details) {
    super(message, { statusCode: 409, code: 'CONFLICT', details });
  }
}

/** Ensure a client never receives stack traces or SQL fragments. */
function toPublicError(err) {
  if (err instanceof AppError) return err;
  if (err && err.expose === true) {
    const wrapped = new AppError(err.message, {
      statusCode: err.statusCode || 400,
      code: err.code || 'APP_ERROR',
    });
    return wrapped;
  }
  return new AppError('Internal server error', {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
  });
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  toPublicError,
};
