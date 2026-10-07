'use strict';

/**
 * TBRide :: smoke test
 * End-to-end verification of the realtime ride lifecycle against a running
 * server (npm start). Uses the official Socket.IO client from Node — the
 * browser client served at /socket.io/socket.io.js speaks the same protocol.
 *
 *   npm start                     # in one terminal
 *   node scripts/smoke-test.js    # in another
 */

const { io } = require('socket.io-client');
require('dotenv').config();
const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 3000}`;

const RIDER = process.env.TEST_RIDER_PHONE;
const RIDER2 = process.env.TEST_RIDER2_PHONE;
const DRIVER = process.env.TEST_DRIVER_PHONE;
const DRIVER2 = process.env.TEST_DRIVER2_PHONE;
const OPERATOR = process.env.TEST_OPERATOR_PHONE;
const ADMIN = process.env.TEST_ADMIN_PHONE;
const TEST_PASSWORD = process.env.TEST_ACCOUNT_PASSWORD;
const REQUIRED_TEST_ENV = [
  'TEST_RIDER_PHONE',
  'TEST_RIDER2_PHONE',
  'TEST_DRIVER_PHONE',
  'TEST_DRIVER2_PHONE',
  'TEST_OPERATOR_PHONE',
  'TEST_ADMIN_PHONE',
  'TEST_ACCOUNT_PASSWORD',
];

let failures = 0;

function check(label, condition, extra) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.error(`  \u2717 ${label} ${extra ? JSON.stringify(extra).slice(0, 220) : ''}`);
  }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket connect timeout')), 8000);
  });
}

/** Register the listener BEFORE the caller emits, so nothing is missed. */
function once(socket, event, timeout = 6000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ __timeout: true }), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (ack) => resolve(ack || { ok: false })));
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

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Do not run smoke tests against production data');
  }
  const missing = REQUIRED_TEST_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Set test account environment variables before running: ${missing.join(', ')}`);
  }
  console.log(`TBRide smoke test -> ${BASE}\n`);

  // 1. health -------------------------------------------------------------
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check('GET /api/health ok', health.ok === true && health.database.ok === true, health);

  // 2. authentication -----------------------------------------------------
  const rider = await login(RIDER);
  const rider2 = await login(RIDER2);
  const driver = await login(DRIVER);
  const driver2 = await login(DRIVER2);
  const operator = await login(OPERATOR);
  const admin = await login(ADMIN);
  check('JWT roles issued', rider.user.role === 'user' && driver.user.role === 'driver' &&
    operator.user.role === 'operator' && admin.user.role === 'admin');

  const badLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: '+10000000', password: TEST_PASSWORD }),
  });
  check('unknown phone rejected (401)', badLogin.status === 401, { status: badLogin.status });

  const wrongPassword = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: RIDER, password: 'incorrect-password' }),
  });
  check('wrong password rejected (401)', wrongPassword.status === 401, { status: wrongPassword.status });

  const noToken = await fetch(`${BASE}/api/admin/overview`);
  check('admin API requires a token', noToken.status === 401, { status: noToken.status });

  const forbidden = await fetch(`${BASE}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${rider.token}` },
  });
  check('admin API blocked for riders (403)', forbidden.status === 403, { status: forbidden.status });


  // 3. sockets + snapshots ------------------------------------------------
  const riderSocket = await connect(rider.token);
  const driverSocket = await connect(driver.token);
  // Attach the driver listener NOW: the server pushes driver:snapshot right
  // after the handshake, and Socket.IO events are not buffered for late
  // listeners (waiting for the operator's connect would drop it).
  const driverReady = once(driverSocket, 'driver:snapshot', 6000);
  const operatorSocket = await connect(operator.token);
  check('three sockets connected', riderSocket.connected && driverSocket.connected && operatorSocket.connected);

  const operatorReady = once(operatorSocket, 'operator:snapshot', 6000);
  await emit(operatorSocket, 'operator:snapshot_request', {});
  const opSnap = await operatorReady;
  const drSnap = await driverReady;
  check('operator snapshot has pending + drivers', Array.isArray(opSnap.pending) && Array.isArray(opSnap.drivers), opSnap);
  check('driver snapshot has profile', Boolean(drSnap.driver && drSnap.driver.driverId), drSnap);

  // 4. driver status + GPS ------------------------------------------------
  const status = await emit(driverSocket, 'driver:status_change', { status: 'online' });
  check('driver went online', status.ok && status.data.status === 'online', status);

  const badStatus = await emit(driverSocket, 'driver:status_change', { status: 'banana' });
  check('invalid driver status rejected', badStatus.ok === false, badStatus);

  const badGps = await emit(driverSocket, 'driver:location_update', { lat: 999, lng: 69.24 });
  check('out-of-range GPS rejected', badGps.ok === false && badGps.error.code === 'VALIDATION_ERROR', badGps);

  const driverStatusEvent = once(operatorSocket, 'driver:status', 4000);
  const locationEvent = once(operatorSocket, 'driver:location', 4000);
  await emit(driverSocket, 'driver:location_update', { lat: 41.3001, lng: 69.2405 });
  const locationBroadcast = await locationEvent;
  check('driver:location reached operators_room',
    !locationBroadcast.__timeout && Math.abs(locationBroadcast.lat - 41.3001) < 1e-6, locationBroadcast);
  await driverStatusEvent;

  // 5. ride request -------------------------------------------------------
  const newRequest = once(operatorSocket, 'ride:new_request', 6000);
  const createdEvent = once(riderSocket, 'ride:created', 6000);
  const created = await emit(riderSocket, 'user:request_ride', {
    pickup_lat: 41.2995, pickup_lng: 69.2401, dropoff_lat: 41.3111, dropoff_lng: 69.2797,
  });
  check('ride created as pending', created.ok && created.data.ride.status === 'pending', created);
  const requestEvent = await newRequest;
  const rideId = created.data.ride.id;
  check('ride:new_request broadcast to operators', !requestEvent.__timeout && requestEvent.ride.id === rideId, requestEvent);
  const createdBroadcast = await createdEvent;
  check('ride:created delivered to the rider', !createdBroadcast.__timeout && createdBroadcast.ride.id === rideId);

  const badCoords = await emit(rider2 ? riderSocket : riderSocket, 'user:request_ride', {
    pickup_lat: 411.2995, pickup_lng: 69.2401, dropoff_lat: 41.3111, dropoff_lng: 69.2797,
  });
  check('invalid coordinates rejected', badCoords.ok === false && badCoords.error.code === 'VALIDATION_ERROR', badCoords);

  // 6. manual dispatch ----------------------------------------------------
  const statusUpdate = once(operatorSocket, 'ride:status_update', 6000);
  const offerEvent = once(driverSocket, 'driver:ride_offer', 6000);
  const assigned = await emit(operatorSocket, 'operator:assign_ride', {
    ride_id: rideId, driver_id: driver.user.id,
  });
  check('operator:assign_ride -> assigned + driver active',
    assigned.ok && assigned.data.ride.status === 'assigned', assigned);
  const offer = await offerEvent;
  check('driver:ride_offer delivered privately', !offer.__timeout && offer.ride.id === rideId, offer);
  const broadcastStatus = await statusUpdate;
  check('ride:status_update broadcast', !broadcastStatus.__timeout &&
    broadcastStatus.ride.id === rideId && broadcastStatus.ride.status === 'assigned', broadcastStatus);

  // 7. concurrency guards -------------------------------------------------
  const rider2Socket = await connect(rider2.token);
  const otherRide = await emit(rider2Socket, 'user:request_ride', {
    pickup_lat: 41.3042, pickup_lng: 69.2467, dropoff_lat: 41.2856, dropoff_lng: 69.2035,
  });
  check('second rider created a ride', otherRide.ok, otherRide);
  const busyDriver = await emit(operatorSocket, 'operator:assign_ride', {
    ride_id: otherRide.data.ride.id, driver_id: driver.user.id,
  });
  check('busy driver rejected for a second ride',
    busyDriver.ok === false && busyDriver.error.code === 'CONFLICT', busyDriver);

  const rogueAssign = await emit(rider2Socket, 'operator:assign_ride', {
    ride_id: otherRide.data.ride.id, driver_id: driver2.user.id,
  });
  check('rider cannot dispatch', rogueAssign.ok === false, rogueAssign);

  const unknownRide = await emit(operatorSocket, 'operator:assign_ride', {
    ride_id: '00000000-0000-4000-8000-00000000dead', driver_id: driver2.user.id,
  });
  check('unknown ride rejected', unknownRide.ok === false && unknownRide.error.code === 'NOT_FOUND', unknownRide);

  // 8. lifecycle ----------------------------------------------------------
  const arrivedAck = await emit(driverSocket, 'driver:arrived', { ride_id: rideId });
  check('driver:arrived accepted', arrivedAck.ok, arrivedAck);
  const started = await emit(driverSocket, 'driver:start_ride', { ride_id: rideId });
  check('start_ride -> in_progress', started.ok && started.data.ride.status === 'in_progress', started);
  const duplicateStart = await emit(driverSocket, 'driver:start_ride', { ride_id: rideId });
  check('illegal transition rejected', duplicateStart.ok === false, duplicateStart);

  const driverStatusAfterComplete = once(operatorSocket, 'driver:status', 6000);
  const completed = await emit(driverSocket, 'driver:complete_ride', { ride_id: rideId });
  check('complete_ride -> completed', completed.ok && completed.data.ride.status === 'completed', completed);
  const afterComplete = await driverStatusAfterComplete;
  check('driver back online after completion', !afterComplete.__timeout && afterComplete.status === 'online', afterComplete);

  // 9. cancellation -------------------------------------------------------
  const again = await emit(riderSocket, 'user:request_ride', {
    pickup_lat: 41.3111, pickup_lng: 69.2797, dropoff_lat: 41.2995, dropoff_lng: 69.2401,
  });
  check('rider can request again after completion', again.ok, again);
  const cancel = await emit(riderSocket, 'user:cancel_ride', { ride_id: again.data.ride.id });
  check('rider cancelled a pending ride', cancel.ok && cancel.data.ride.status === 'cancelled', cancel);

  const assignedThenCancelled = await emit(riderSocket, 'user:request_ride', {
    pickup_lat: 41.2995, pickup_lng: 69.2401, dropoff_lat: 41.3042, dropoff_lng: 69.2467,
  });
  await emit(operatorSocket, 'operator:assign_ride', {
    ride_id: assignedThenCancelled.data.ride.id, driver_id: driver2.user.id,
  });
  const cancelAssigned = await emit(operatorSocket, 'operator:cancel_ride', {
    ride_id: assignedThenCancelled.data.ride.id,
  });
  check('operator cancelled an assigned ride',
    cancelAssigned.ok && cancelAssigned.data.ride.status === 'cancelled', cancelAssigned);

  const driver2Status = await emit(driver2 ? operatorSocket : operatorSocket, 'operator:drivers', {});
  const driver2Profile = driver2Status.ok
    ? driver2Status.data.drivers.filter((d) => d.driverId === driver2.user.id)[0]
    : null;
  check('cancelled ride released the driver back to online',
    driver2Profile && driver2Profile.status === 'online', driver2Profile);

  const notFound = await emit(riderSocket, 'user:cancel_ride', { ride_id: '00000000-0000-4000-8000-000000000000' });
  check('cancelling an unknown ride fails cleanly', notFound.ok === false, notFound);

  // 10. offline guard -----------------------------------------------------
  const driver2StatusChange = await emit(driverSocket, 'driver:status_change', { status: 'offline' });
  check('driver can go offline when idle', driver2StatusChange.ok &&
    driver2StatusChange.data.status === 'offline', driver2StatusChange);
  const offlineGps = await emit(driverSocket, 'driver:location_update', { lat: 41.2995, lng: 69.2401 });
  check('offline driver cannot stream GPS', offlineGps.ok === false, offlineGps);

  // 11. admin -------------------------------------------------------------
  const adminOverview = await fetch(`${BASE}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const adminData = await adminOverview.json();
  check('admin overview ok', adminData.stats && Array.isArray(adminData.logs) && adminData.users.length >= 6);
  const adminStats = await (await fetch(`${BASE}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).json();
  check('admin stats include dispatch counters', adminStats.stats && adminStats.dispatch, adminStats);
  const logs = await (await fetch(`${BASE}/api/admin/logs?limit=20`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).json();
  check('system logs recorded the lifecycle',
    logs.logs.some((l) => l.event === 'ride.completed') && logs.logs.some((l) => l.event === 'ride.assigned'), logs.logs);

  [riderSocket, rider2Socket, driverSocket, operatorSocket].forEach((s) => s.disconnect());

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
});
