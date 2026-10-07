'use strict';

/**
 * TBRide :: authentication service.
 * Authentication uses phone numbers plus salted scrypt password hashes.
 */

const usersRepo = require('../repositories/users.repository');
const systemLogs = require('../repositories/logs.repository');
const tokenService = require('../utils/token');
const { AuthError, ValidationError, ConflictError } = require('../utils/errors');
const { assertPhoneNumber, assertFullName } = require('../utils/validation');
const config = require('../config');
const { assertPassword } = require('../utils/validation');
const { hashPassword, verifyPassword } = require('../utils/password');

async function loginWithPassword(rawPhone, rawPassword) {
  const phone = assertPhoneNumber(rawPhone);
  const password = assertPassword(rawPassword);
  const user = await usersRepo.findCredentialsByPhone(phone);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AuthError('Invalid phone number or password');
  }

  const jwt = tokenService.sign({
    sub: user.id,
    role: user.role,
    name: user.full_name,
  });

  await systemLogs.log({
    actorId: user.id,
    actorRole: user.role,
    event: 'auth.login',
    entityId: user.id,
    level: 'info',
    details: { channel: 'password', dev: !config.isProduction },
  });

  return {
    token: jwt,
    tokenType: 'Bearer',
    expiresIn: config.auth.tokenTtlSeconds,
    user: {
      id: user.id,
      fullName: user.full_name,
      phoneNumber: user.phone_number,
      role: user.role,
      vehicleModel: user.vehicle_model || null,
      licensePlate: user.license_plate || null,
      driverStatus: user.driver_status || null,
      lat: user.driver_lat ? Number(user.driver_lat) : null,
      lng: user.driver_lng ? Number(user.driver_lng) : null,
    },
  };
}

async function registerRider(rawFullName, rawPhone, rawPassword) {
  const fullName = assertFullName(rawFullName);
  const phoneNumber = assertPhoneNumber(rawPhone);
  const passwordHash = await hashPassword(assertPassword(rawPassword));
  const existing = await usersRepo.findByPhone(phoneNumber);
  if (existing) throw new ConflictError('Phone number already registered');

  const user = await usersRepo.create({ fullName, phoneNumber, role: 'user', passwordHash });
  await systemLogs.log({
    actorId: user.id,
    actorRole: 'user',
    event: 'auth.signup',
    entityId: user.id,
    level: 'info',
    details: { channel: 'password' },
  });

  return loginWithPassword(phoneNumber, rawPassword);
}

/** Who am I? Used by the client to restore a session. */
async function me(identity) {
  if (!identity) throw new AuthError('Not authenticated');
  const user = await usersRepo.findById(identity.id);
  if (!user) throw new AuthError('Account no longer exists');
  if (user.role !== identity.role) throw new AuthError('Token role no longer matches account');
  return {
    id: user.id,
    fullName: user.full_name,
    phoneNumber: user.phone_number,
    role: user.role,
    vehicleModel: user.vehicle_model || null,
    licensePlate: user.license_plate || null,
    driverStatus: user.driver_status || null,
    lat: user.driver_lat ? Number(user.driver_lat) : null,
    lng: user.driver_lng ? Number(user.driver_lng) : null,
  };
}

function requireRole(identity, roles) {
  if (!identity) throw new AuthError('Not authenticated');
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(identity.role)) {
    throw new ValidationError(`Requires role: ${allowed.join(' or ')}`);
  }
  return identity;
}

module.exports = { loginWithPassword, registerRider, me, requireRole };
