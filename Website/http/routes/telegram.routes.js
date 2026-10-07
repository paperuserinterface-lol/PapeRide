'use strict';

/**
 * TBRide :: Telegram bridge API (guarded by X-Telegram-Token, no JWT).
 *
 *   POST /api/telegram/rides            book a ride for a Telegram user
 *   GET  /api/telegram/rides            that user's rides + live status
 *   POST /api/telegram/rides/:id/cancel cancel the rider's own ride
 *
 * These are the only entry points the PapeRide Telegram bot uses. Responses
 * are the same serialised rides the socket layer broadcasts, so the bot and
 * the web dashboards always agree.
 */

const express = require('express');
const telegramService = require('../../services/telegram.service');
const { requireTelegramToken } = require('../middleware/telegram.middleware');
const { ValidationError } = require('../../utils/errors');
const { assertUuid } = require('../../utils/validation');

const router = express.Router();

router.use(requireTelegramToken);

/** POST /api/telegram/rides — book a ride, returns { ride, quote }. */
router.post('/rides', async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await telegramService.bookRide(
      body.telegram_user_id,
      { username: body.username, firstName: body.first_name },
      {
        pickup_lat: body.pickup_lat,
        pickup_lng: body.pickup_lng,
        dropoff_lat: body.dropoff_lat,
        dropoff_lng: body.dropoff_lng,
        pickup_label: body.pickup_label,
        dropoff_label: body.dropoff_label,
      }
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/telegram/rides?telegram_user_id=&limit= — { rides: [...] }. */
router.get('/rides', async (req, res, next) => {
  try {
    const telegramUserId = req.query.telegram_user_id;
    if (telegramUserId === undefined) {
      throw new ValidationError('telegram_user_id is required', { field: 'telegram_user_id' });
    }
    const limit = Number(req.query.limit);
    const rides = await telegramService.listRides(telegramUserId, {
      limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
    });
    res.json({ rides });
  } catch (err) {
    next(err);
  }
});

/** POST /api/telegram/rides/:id/cancel — rider cancels their own ride. */
router.post('/rides/:id/cancel', async (req, res, next) => {
  try {
    const rideId = assertUuid(req.params.id, 'ride id');
    const telegramUserId = (req.body || {}).telegram_user_id;
    const result = await telegramService.cancelRide(telegramUserId, rideId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
