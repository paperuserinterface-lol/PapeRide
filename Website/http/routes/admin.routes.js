'use strict';

/**
 * TBRide :: admin management API (all routes require role = admin).
 */

const express = require('express');
const usersRepo = require('../../repositories/users.repository');
const driversRepo = require('../../repositories/drivers.repository');
const ridesRepo = require('../../repositories/rides.repository');
const systemLogs = require('../../repositories/logs.repository');
const ridesService = require('../../services/rides.service');
const dispatchService = require('../../services/dispatch.service');
const { authenticate, requireRole, requireFreshIdentity } = require('../middleware/auth.middleware');
const {
  assertUuid,
  assertFullName,
  assertPhoneNumber,
  assertOneOf,
  ROLES,
  assertVehicleModel,
  assertLicensePlate,
} = require('../../utils/validation');
const { ValidationError, ConflictError } = require('../../utils/errors');
const io = require('../../realtime/io');
const events = require('../../realtime/ride.events');
const { serialiseRide, serialiseDriver } = require('../../realtime/snapshots');
const { assertPassword } = require('../../utils/validation');
const { hashPassword } = require('../../utils/password');

const router = express.Router();

router.use(authenticate, requireRole('admin'), requireFreshIdentity);

/** GET /api/admin/overview */
router.get('/overview', async (_req, res, next) => {
  try {
    const { buildAdminSnapshot } = require('../../realtime/snapshots');
    const snapshot = await buildAdminSnapshot();
    res.json({ ...snapshot, sockets: { connected: io.connectedSessionCount(), byRole: io.sessionsByRole() } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/users?role=driver */
router.get('/users', async (req, res, next) => {
  try {
    const users = req.query.role
      ? await usersRepo.listByRole(assertOneOf(req.query.role, ROLES, 'role'))
      : await usersRepo.listAll();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/users  (creates a driver profile when role = driver) */
router.post('/users', async (req, res, next) => {
  try {
    const body = req.body || {};
    const fullName = assertFullName(body.full_name);
    const phoneNumber = assertPhoneNumber(body.phone_number);
    const passwordHash = await hashPassword(assertPassword(body.password));
    const role = assertOneOf(body.role, ROLES, 'role');

    const existing = await usersRepo.findByPhone(phoneNumber);
    if (existing) throw new ConflictError('Phone number already registered');

    const vehicleModel = role === 'driver' ? assertVehicleModel(body.vehicle_model) : null;
    const licensePlate = role === 'driver' ? assertLicensePlate(body.license_plate) : null;

    const user = await usersRepo.create({ fullName, phoneNumber, role, passwordHash, vehicleModel, licensePlate });
    await systemLogs.log({
      actorId: req.identity.id,
      actorRole: 'admin',
      event: 'admin.user_created',
      entityId: user.id,
      details: { role, phoneNumber },
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id */
router.patch('/users/:id', async (req, res, next) => {
  try {
    const id = assertUuid(req.params.id, 'user id');
    const body = req.body || {};
    const fullName = body.full_name !== undefined ? assertFullName(body.full_name) : null;
    const phoneNumber = body.phone_number !== undefined ? assertPhoneNumber(body.phone_number) : null;
    const passwordHash =
      body.password !== undefined && body.password !== null
        ? await hashPassword(assertPassword(body.password))
        : null;
    const user = await usersRepo.update(id, { fullName, phoneNumber, passwordHash });
    if (!user) return next(new ValidationError('User not found'));
    await systemLogs.log({
      actorId: req.identity.id,
      actorRole: 'admin',
      event: 'admin.user_updated',
      entityId: id,
      details: { fullName, phoneNumber },
    });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/admin/users/:id  (ON DELETE CASCADE / SET NULL handled in SQL) */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = assertUuid(req.params.id, 'user id');
    if (id === req.identity.id) throw new ConflictError('You cannot delete your own account');
    const removed = await usersRepo.remove(id);
    if (!removed) return next(new ValidationError('User not found'));
    await systemLogs.log({
      actorId: req.identity.id,
      actorRole: 'admin',
      event: 'admin.user_deleted',
      entityId: id,
      level: 'warn',
      details: {},
    });
    return res.json({ deleted: removed.id });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/admin/drivers */
router.get('/drivers', async (_req, res, next) => {
  try {
    const drivers = await driversRepo.listAll();
    res.json({ drivers: drivers.map(serialiseDriver) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/rides?status= */
router.get('/rides', async (req, res, next) => {
  try {
    const statuses = req.query.status
      ? String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const rides = await ridesRepo.listByStatuses(statuses, { limit: req.query.limit });
    res.json({ rides: rides.map(serialiseRide) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/rides/:id/assign { driver_id } */
router.post('/rides/:id/assign', async (req, res, next) => {
  try {
    const rideId = assertUuid(req.params.id, 'ride id');
    const driverId = assertUuid(req.body && req.body.driver_id, 'driver_id');
    const result = await ridesService.assignRide({
      operatorId: req.identity.id,
      rideId,
      driverId,
      via: 'admin_api',
    });
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'pending',
      stage: 'assigned',
      actor: { id: req.identity.id, role: 'admin', name: req.identity.name },
    });
    events.emitDriverRideOffer(result.ride, result.ride.assigned_driver_id);
    res.json({ ride: serialiseRide(result.ride) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/rides/:id/cancel */
router.post('/rides/:id/cancel', async (req, res, next) => {
  try {
    const rideId = assertUuid(req.params.id, 'ride id');
    const result = await ridesService.cancelRide(req.identity, rideId, 'cancelled_by_admin');
    events.emitRideStatusUpdate({
      ride: result.ride,
      previousStatus: 'assigned',
      stage: 'cancelled_by_admin',
      actor: { id: req.identity.id, role: 'admin', name: req.identity.name },
    });
    events.emitRideRemovedFromBoard(result.ride.id, 'cancelled');
    res.json({ ride: serialiseRide(result.ride) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/logs?level=&event=&limit= */
router.get('/logs', async (req, res, next) => {
  try {
    res.json({ logs: await systemLogs.list(req.query) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/stats */
router.get('/stats', async (_req, res, next) => {
  try {
    const [userCounts, driverCounts, rideCounts, events] = await Promise.all([
      usersRepo.countByRole(),
      driversRepo.countByStatus(),
      ridesRepo.countByStatus(),
      systemLogs.recentEvents(),
    ]);
    res.json({
      stats: { users: userCounts, drivers: driverCounts, rides: rideCounts, events },
      sockets: { connected: io.connectedSessionCount(), byRole: io.sessionsByRole() },
      dispatch: await dispatchService.dashboardSnapshot().then((snap) => ({
        pending: snap.pending.length,
        live: snap.live.length,
        onlineDrivers: snap.drivers.length,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
