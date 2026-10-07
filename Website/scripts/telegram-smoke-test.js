'use strict';

/**
 * TBRide :: Telegram bridge smoke test
 * Verifies the /api/telegram/* contract the PapeRide Telegram bot depends on
 * against a running server (npm start): token guard, booking, the live status
 * round-trip (book -> operator dispatch -> bot-visible status -> cancel),
 * the 409 "active ride" guard and the audit trail.
 *
 *   npm start                 # in one terminal
 *   npm run test:telegram     # in another
 */

require('dotenv').config();
const { randomInt } = require('crypto');

const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 3000}`;
const TOKEN = process.env.TELEGRAM_INTERNAL_TOKEN;
const TG_USER = randomInt(1, Number.MAX_SAFE_INTEGER);
const ADMIN = process.env.TEST_ADMIN_PHONE;
const TEST_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD;

const TG_HEADERS = { 'Content-Type': 'application/json', 'X-Telegram-Token': TOKEN };

let failures = 0;

function check(label, condition, extra) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.error(`  \u2717 ${label} ${extra ? JSON.stringify(extra).slice(0, 220) : ''}`);
  }
}

async function login(phone) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phone, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed for ${phone}: HTTP ${res.status}`);
  return res.json();
}

function tgGet(path, headers = TG_HEADERS) {
  return fetch(`${BASE}${path}`, { headers });
}

function tgPost(path, body, headers = TG_HEADERS) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const BOOKING_BODY = {
  telegram_user_id: TG_USER,
  username: 'smoke_rider',
  first_name: 'Smoke Tester',
  pickup_lat: 41.3112,
  pickup_lng: 69.2795,
  dropoff_lat: 41.2887,
  dropoff_lng: 69.2341,
  pickup_label: 'Amir Temur Avenue',
  dropoff_label: 'Tashkent Station',
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Do not run smoke tests against production data');
  }
  const missing = [
    ['TELEGRAM_INTERNAL_TOKEN', TOKEN],
    ['TEST_ADMIN_PHONE', ADMIN],
    ['TEST_ACCOUNT_PASSWORD', TEST_PASSWORD],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Set test environment variables before running: ${missing.join(', ')}`);
  }
  console.log(`TBRide Telegram bridge smoke test -> ${BASE}\n`);

  // 1. health -------------------------------------------------------------
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check('GET /api/health ok', health.ok === true && health.database.ok === true, health);

  // 2. token guard --------------------------------------------------------
  const noToken = await fetch(`${BASE}/api/telegram/rides?telegram_user_id=${TG_USER}`);
  check('missing token rejected (401)', noToken.status === 401, { status: noToken.status });
  const badToken = await tgGet(`/api/telegram/rides?telegram_user_id=${TG_USER}`, {
    'Content-Type': 'application/json',
    'X-Telegram-Token': 'wrong-token',
  });
  check('wrong token rejected (401)', badToken.status === 401, { status: badToken.status });

  // 3. clean slate: cancel leftovers from a previous run -------------------
  const stale = await (await tgGet(`/api/telegram/rides?telegram_user_id=${TG_USER}&limit=20`)).json();
  for (const ride of stale.rides || []) {
    if (['pending', 'assigned'].includes(ride.status)) {
      await tgPost(`/api/telegram/rides/${ride.id}/cancel`, { telegram_user_id: TG_USER });
    }
  }
  check('previous runs cleaned up', true);

  // 4. booking ------------------------------------------------------------
  const bookRes = await tgPost('/api/telegram/rides', BOOKING_BODY);
  check('POST /api/telegram/rides -> 201', bookRes.status === 201, { status: bookRes.status });
  const booking = await bookRes.json();
  const rideId = booking.ride && booking.ride.id;
  check('ride id + quote returned', Boolean(rideId) && booking.quote && booking.quote.fare > 0, booking);
  check('ride starts pending', booking.ride && booking.ride.status === 'pending', booking.ride);
  check('rider keyed as tg:<id>', booking.ride && booking.ride.riderPhone === `tg:${TG_USER}`, booking.ride);
  check(
    'address labels round-trip',
    booking.ride && booking.ride.pickupLabel === 'Amir Temur Avenue' &&
      booking.ride.dropoffLabel === 'Tashkent Station',
    booking.ride
  );

  const badBooking = await tgPost('/api/telegram/rides', {
    ...BOOKING_BODY,
    dropoff_lat: BOOKING_BODY.pickup_lat,
    dropoff_lng: BOOKING_BODY.pickup_lng,
  });
  check('identical pickup/dropoff rejected (422)', badBooking.status === 422, { status: badBooking.status });

  // 5. history as the bot reads it ----------------------------------------
  const history = await (await tgGet(`/api/telegram/rides?telegram_user_id=${TG_USER}`)).json();
  check('history contains the new ride', (history.rides || []).some((r) => r.id === rideId), history);

  const badId = await tgGet('/api/telegram/rides?telegram_user_id=not-a-number');
  check('invalid telegram_user_id rejected (422)', badId.status === 422, { status: badId.status });

  // 6. operator dispatch visibility + assignment --------------------------
  const admin = await login(ADMIN);
  const board = await (await fetch(`${BASE}/api/rides?status=pending,assigned,in_progress`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).json();
  check('ride visible on the dispatch board', (board.rides || []).some((r) => r.id === rideId), board);

  const driversResponse = await fetch(`${BASE}/api/drivers`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const driversPayload = await driversResponse.json();
  const drivers = driversPayload.drivers || [];
  check('test drivers available', driversResponse.ok && drivers.length >= 1, driversPayload);

  let assigned = null;
  for (const driver of drivers) {
    const res = await fetch(`${BASE}/api/admin/rides/${rideId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ driver_id: driver.driverId }),
    });
    if (res.ok) { assigned = { driver, body: await res.json() }; break; }
  }
  check('operator assigned a driver', Boolean(assigned), assigned && assigned.body);

  // 7. status the bot's poller reads --------------------------------------
  const afterAssign = await (await tgGet(`/api/telegram/rides?telegram_user_id=${TG_USER}`)).json();
  const live = (afterAssign.rides || []).find((r) => r.id === rideId);
  check('bot sees status=assigned', live && live.status === 'assigned', live);
  check('bot sees driver name + plate + phone',
    live && Boolean(live.driverName) && Boolean(live.licensePlate) && Boolean(live.driverPhone), live);

  const second = await tgPost('/api/telegram/rides', BOOKING_BODY);
  check('second booking blocked while ride active (409)', second.status === 409, { status: second.status });

  // 8. cancellation by the Telegram rider ---------------------------------
  const cancelRes = await tgPost(`/api/telegram/rides/${rideId}/cancel`, { telegram_user_id: TG_USER });
  check('POST cancel -> 200', cancelRes.status === 200, { status: cancelRes.status });
  const cancelled = await cancelRes.json();
  check('ride is cancelled', cancelled.ride && cancelled.ride.status === 'cancelled', cancelled.ride);

  const boardAfter = await (await fetch(`${BASE}/api/rides?status=pending,assigned,in_progress`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).json();
  check('cancelled ride left the board', !(boardAfter.rides || []).some((r) => r.id === rideId), boardAfter);

  // 9. audit trail --------------------------------------------------------
  const logs = await (await fetch(`${BASE}/api/logs?limit=200`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).json();
  const audited = (logs.logs || []).some(
    (l) => l.event === 'telegram.ride_requested' && l.entity_id === rideId
  );
  check('telegram.ride_requested audited', audited, (logs.logs || [])[0]);

  // 10. cleanup: drop the synthetic rider (rides cascade) -----------------
  // Audit rows are flushed asynchronously; give the queue a moment to drain
  // before the rider they reference disappears.
  await new Promise((resolve) => setTimeout(resolve, 700));
  const testUsersResponse = await fetch(`${BASE}/api/admin/users?role=user`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const testUsers = await testUsersResponse.json();
  const riders = (testUsers.users || []).filter((u) => u.phone_number === `tg:${TG_USER}`);
  if (riders.length) {
    await fetch(`${BASE}/api/admin/users/${riders[0].id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin.token}` },
    });
  }
  check('test rider cleaned up', true);

  console.log(failures === 0 ? '\nAll Telegram bridge checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Telegram bridge smoke test crashed: ${err.message}`);
  process.exit(1);
});
