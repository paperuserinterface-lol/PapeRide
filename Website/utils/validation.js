'use strict';

/**
 * TBRide :: server-side validation helpers.
 * Clients are never trusted: ids, roles, statuses and coordinates are all
 * re-validated here before they reach PostgreSQL.
 */

const { ValidationError } = require('./errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = ['user', 'driver', 'operator', 'admin'];
const DRIVER_STATUSES = ['offline', 'online', 'active'];
const RIDE_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
const PHONE_RE = /^\+?[0-9]{7,20}$/;

/** @returns {string} normalised UUID */
function assertUuid(value, field = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new ValidationError(`Invalid ${field}`, { field, reason: 'not_a_uuid' });
  }
  return value.trim().toLowerCase();
}

function assertOneOf(value, allowed, field) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(`Invalid ${field}`, { field, allowed, received: value });
  }
  return value;
}

/**
 * Coordinate parsing with hard range validation.
 * @returns {number} finite float
 */
function assertCoordinate(value, field, { min, max }) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    throw new ValidationError(`Invalid ${field}`, { field, reason: 'not_a_number' });
  }
  if (num < min || num > max) {
    throw new ValidationError(`${field} out of range`, {
      field,
      min,
      max,
      received: num,
    });
  }
  return Math.round(num * 1e8) / 1e8;
}

const assertLatitude = (value, field = 'latitude') =>
  assertCoordinate(value, field, { min: -90, max: 90 });
const assertLongitude = (value, field = 'longitude') =>
  assertCoordinate(value, field, { min: -180, max: 180 });

function assertPhoneNumber(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!PHONE_RE.test(raw)) {
    throw new ValidationError('Invalid phone number', { field: 'phone_number' });
  }
  return raw;
}

function assertFullName(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.length < 2 || raw.length > 120) {
    throw new ValidationError('Invalid full name', { field: 'full_name' });
  }
  return raw;
}

function assertPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ValidationError('Password must be between 8 and 128 characters', {
      field: 'password',
    });
  }
  return value;
}

function assertVehicleModel(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.length < 2 || raw.length > 80) {
    throw new ValidationError('Invalid vehicle model', { field: 'vehicle_model' });
  }
  return raw;
}

function assertLicensePlate(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (raw.length < 3 || raw.length > 24) {
    throw new ValidationError('Invalid license plate', { field: 'license_plate' });
  }
  return raw;
}

/**
 * Optional human readable address label (Telegram riders type them in).
 * Absent/null/blank all collapse to NULL; anything else must be a string.
 * @returns {string|null} trimmed, at most 160 characters
 */
function assertOptionalLabel(value, field = 'label') {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid ${field}`, { field, reason: 'not_a_string' });
  }
  const label = value.trim();
  return label ? label.slice(0, 160) : null;
}

/**
 * Validate a user ride request payload.
 * @returns {{pickupLat:number,pickupLng:number,dropoffLat:number,dropoffLng:number}}
 */
function validateRidePayload(body) {
  const pickupLat = assertLatitude(body && body.pickup_lat, 'pickup_lat');
  const pickupLng = assertLongitude(body && body.pickup_lng, 'pickup_lng');
  const dropoffLat = assertLatitude(body && body.dropoff_lat, 'dropoff_lat');
  const dropoffLng = assertLongitude(body && body.dropoff_lng, 'dropoff_lng');

  if (pickupLat === dropoffLat && pickupLng === dropoffLng) {
    throw new ValidationError('Pickup and destination must differ', {
      field: 'dropoff_lat',
    });
  }
  return { pickupLat, pickupLng, dropoffLat, dropoffLng };
}

/** @returns {{lat:number,lng:number}} */
function validateLocationPayload(body) {
  return {
    lat: assertLatitude(body && body.lat, 'lat'),
    lng: assertLongitude(body && body.lng, 'lng'),
  };
}

/**
 * Great-circle distance in kilometres (no PostGIS required).
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  UUID_RE,
  ROLES,
  DRIVER_STATUSES,
  RIDE_STATUSES,
  assertUuid,
  assertOneOf,
  assertLatitude,
  assertLongitude,
  assertPhoneNumber,
  assertFullName,
  assertPassword,
  assertVehicleModel,
  assertLicensePlate,
  assertOptionalLabel,
  validateRidePayload,
  validateLocationPayload,
  haversineKm,
};
