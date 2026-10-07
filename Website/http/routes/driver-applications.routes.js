'use strict';

/**
 * TBRide :: "Become a Driver" applications.
 *
 * A rider submits their vehicle details; the application is stored in the
 * audit trail (system_logs, event = driver.application) so admins can review
 * it from the console's Applications tab without a schema change.
 */

const express = require('express');
const systemLogs = require('../../repositories/logs.repository');
const { authenticate, requireFreshIdentity } = require('../middleware/auth.middleware');
const { assertVehicleModel, assertLicensePlate } = require('../../utils/validation');
const { ValidationError, ConflictError } = require('../../utils/errors');

const router = express.Router();

const EVENT = 'driver.application';

/** POST /api/driver-applications  { vehicle_model, license_plate, note? } */
router.post('/', authenticate, requireFreshIdentity, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== 'user') {
      throw new ConflictError('Only rider accounts can apply to become a driver');
    }

    const body = req.body || {};
    const vehicleModel = assertVehicleModel(body.vehicle_model);
    const licensePlate = assertLicensePlate(body.license_plate);
    const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
    const note = rawNote ? rawNote.slice(0, 500) : null;

    if (await systemLogs.hasPendingDriverApplication(user.id)) {
      throw new ConflictError('You already have an application pending review');
    }

    await systemLogs.log({
      actorId: user.id,
      actorRole: user.role,
      event: EVENT,
      entityId: user.id,
      level: 'info',
      details: {
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        vehicleModel,
        licensePlate,
        note,
      },
    });

    res.status(201).json({ status: 'submitted', event: EVENT });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
