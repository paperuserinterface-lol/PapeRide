'use strict';

/**
 * TBRide :: auth + public bootstrap routes.
 */

const express = require('express');
const authService = require('../../services/auth.service');
const driversRepo = require('../../repositories/drivers.repository');
const ridesRepo = require('../../repositories/rides.repository');
const systemLogs = require('../../repositories/logs.repository');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { ValidationError } = require('../../utils/errors');
const config = require('../../config');
const io = require('../../realtime/io');

const router = express.Router();

/** POST /api/auth/login  { phone_number, password } -> { token, user } */
router.post('/login', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body.phone_number !== 'string' || typeof req.body.password !== 'string') {
      throw new ValidationError('phone_number and password are required');
    }
    const session = await authService.loginWithPassword(req.body.phone_number, req.body.password);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/register { full_name, phone_number, password } -> { token, user } */
router.post('/register', async (req, res, next) => {
  try {
    const body = req.body || {};
    const session = await authService.registerRider(body.full_name, body.phone_number, body.password);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ user: await authService.me(req.identity) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/health — used by the sandbox healthcheck. */
router.get('/health', async (_req, res) => {
  const payload = {
    ok: true,
    service: config.app.name,
    env: config.env,
    uptimeSeconds: Math.round(process.uptime()),
    sockets: { connected: io.connectedSessionCount(), byRole: io.sessionsByRole() },
    timestamp: new Date().toISOString(),
  };
  try {
    const info = await require('../../db').verifyConnection();
    payload.database = { ok: true, database: info.db, serverTime: info.now };
  } catch (err) {
    payload.ok = false;
    payload.database = { ok: false, error: 'unavailable' };
    return res.status(500).json(payload);
  }
  return res.json(payload);
});

/** GET /api/overview — authenticated role-aware snapshot (REST fallback). */
router.get('/overview', authenticate, async (req, res, next) => {
  try {
    const { buildSnapshot } = require('../../realtime/snapshots');
    const snapshot = await buildSnapshot(req.identity);
    res.json(snapshot ? snapshot.payload : {});
  } catch (err) {
    next(err);
  }
});

/** GET /api/drivers — operators and admins only. */
router.get('/drivers', authenticate, requireRole('operator', 'admin'), async (_req, res, next) => {
  try {
    const drivers = await driversRepo.listAll();
    res.json({
      drivers: drivers.map((d) => ({
        driverId: d.driver_id || d.id,
        fullName: d.full_name,
        phone: d.phone_number,
        vehicleModel: d.vehicle_model,
        licensePlate: d.license_plate,
        status: d.status,
        location:
          d.current_lat !== null && d.current_lat !== undefined
            ? { lat: Number(d.current_lat), lng: Number(d.current_lng) }
            : null,
        updatedAt: d.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/rides — operators and admins only. */
router.get('/rides', authenticate, requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const status = req.query.status;
    const statuses = status
      ? String(status).split(',').map((s) => s.trim()).filter(Boolean)
      : ['pending', 'assigned', 'in_progress'];
    const rides = await ridesRepo.listByStatuses(statuses, { limit: req.query.limit });
    const { serialiseRide } = require('../../realtime/snapshots');
    res.json({ rides: rides.map(serialiseRide) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/rides/history — a rider's own ride history. */
router.get('/rides/history', authenticate, async (req, res, next) => {
  try {
    if (req.identity.role === 'driver') {
      const rides = await ridesRepo.listByDriver(req.identity.id);
      const { serialiseRide } = require('../../realtime/snapshots');
      return res.json({ rides: rides.map(serialiseRide) });
    }
    if (req.identity.role !== 'user') {
      throw new ValidationError('Role has no ride history');
    }
    const rides = await ridesRepo.listByUser(req.identity.id);
    const { serialiseRide } = require('../../realtime/snapshots');
    return res.json({ rides: rides.map(serialiseRide) });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/logs — admins only. */
router.get('/logs', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    res.json({ logs: await systemLogs.list(req.query) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
