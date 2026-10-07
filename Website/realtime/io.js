'use strict';

/**
 * TBRide :: Socket.IO server wiring.
 *
 * Responsibilities:
 *   - authenticate every handshake with the same JWT used by HTTP
 *   - join role specific rooms
 *   - normalise handler errors into `server:error` (+ ack callbacks)
 *   - expose typed broadcast helpers used by the service layer callbacks
 */

const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../utils/logger');
const tokenService = require('../utils/token');
const { toPublicError, AuthError } = require('../utils/errors');
const usersRepo = require('../repositories/users.repository');
const { ROOMS, EVENTS } = require('./rooms');
const { buildSnapshot } = require('./snapshots');

let io = null;

/** socket.id -> { id, role, name } */
const sessions = new Map();

/** socket.io handshake authentication. Never trust client supplied ids. */
async function authenticate(socket, next) {
  try {
    const bearer =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake.query && socket.handshake.query.token) ||
      (socket.handshake.headers && socket.handshake.headers.authorization
        ? String(socket.handshake.headers.authorization).replace(/^bearer\s+/i, '')
        : null);

    const claims = tokenService.verify(bearer);
    const user = await usersRepo.findById(claims.sub);
    if (!user || user.role !== claims.role) {
      throw new AuthError('Account no longer exists or its role has changed');
    }
    socket.data.identity = { id: user.id, role: user.role, name: user.full_name };
    return next();
  } catch (err) {
    logger.warn('Socket handshake rejected', { error: err.message, ip: socket.handshake.address });
    return next(new Error(err instanceof AuthError ? err.message : 'Authentication failed'));
  }
}

function joinRoomsFor(socket) {
  const identity = socket.data.identity;
  socket.join(ROOMS.user(identity.id));
  if (identity.role === 'driver') {
    socket.join(ROOMS.driver(identity.id));
    socket.join(ROOMS.DRIVERS);
  }
  if (identity.role === 'operator') {
    socket.join(ROOMS.OPERATORS);
    socket.join(ROOMS.user(identity.id));
  }
  if (identity.role === 'admin') {
    socket.join(ROOMS.OPERATORS); // read-only monitoring of the dispatch floor
    socket.join(ROOMS.DRIVERS);
  }
}

/** Wrap a handler with ack support + `server:error` emission. */
function register(socket, event, handler) {
  socket.on(event, async (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    const payload = ack ? args[args.length - 2] : args[0];
    try {
      const data = await handler(payload === undefined ? {} : payload, socket);
      if (ack) ack({ ok: true, data: data === undefined ? null : data });
    } catch (err) {
      const publicError = toPublicError(err);
      logger.warn('Socket handler failed', {
        event,
        code: publicError.code,
        message: publicError.message,
        socketId: socket.id,
      });
      const errorPayload = {
        event,
        code: publicError.code,
        message: publicError.message,
        details: publicError.details || null,
        at: new Date().toISOString(),
      };
      socket.emit(EVENTS.SERVER_ERROR, errorPayload);
      if (ack) ack({ ok: false, error: { code: publicError.code, message: publicError.message } });
    }
  });
}

async function onConnection(socket) {
  const identity = socket.data.identity;
  joinRoomsFor(socket);
  sessions.set(socket.id, identity);
  logger.info('Client connected', {
    role: identity.role,
    userId: identity.id,
    connectedClients: sessions.size,
  });

  // Handlers are attached SYNCHRONOUSLY before any await. A client that emits
  // straight after `connect` would otherwise have its packet (and ack) dropped.
  const registerDriverHandlers = require('./handlers/driver.handlers');
  const registerUserHandlers = require('./handlers/user.handlers');
  const registerOperatorHandlers = require('./handlers/operator.handlers');

  registerDriverHandlers(socket, { register });
  registerUserHandlers(socket, { register });
  registerOperatorHandlers(socket, { register });

  register(socket, EVENTS.RIDE_SUBSCRIBE, async (payload) => {
    const rideId = String((payload && payload.ride_id) || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(rideId)) throw new Error('Invalid ride id');
    socket.join(ROOMS.ride(rideId));
    return { subscribed: rideId };
  });

  socket.on('disconnect', (reason) => {
    sessions.delete(socket.id);
    logger.info('Client disconnected', { role: identity.role, userId: identity.id, reason });
  });

  socket.emit(EVENTS.CONNECTION_READY, {
    identity,
    at: new Date().toISOString(),
  });

  // Initial state is pushed last: it touches PostgreSQL and may take a moment.
  try {
    const snapshot = await buildSnapshot(identity);
    if (snapshot && snapshot.payload) {
      // Re-join the rooms of rides this identity is still involved in, so a
      // page refresh resumes the live feed immediately.
      const live =
        identity.role === 'user' ? snapshot.payload.activeRide : snapshot.payload.offer;
      if (live && live.id) socket.join(ROOMS.ride(live.id));
      socket.emit(snapshot.event, snapshot.payload);
    }
  } catch (err) {
    logger.error('Snapshot build failed', { error: err.message, role: identity.role });
    socket.emit(EVENTS.SERVER_ERROR, {
      event: 'snapshot',
      code: 'SNAPSHOT_UNAVAILABLE',
      message: 'Could not load your initial state, please reconnect',
    });
  }
}

function init(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.cors.origins, credentials: false },
    pingInterval: config.socket.pingIntervalMs,
    pingTimeout: config.socket.pingTimeoutMs,
    serveClient: true, // serves /socket.io/socket.io.js to the vanilla client
  });

  io.use(authenticate);
  io.on('connection', onConnection);

  // Postgres is authoritative: a crashed client may leave a stale "active".
  setInterval(() => {
    const driversService = require('../services/drivers.service');
    driversService
      .snapshotForOperators()
      .then((snap) => {
        if (snap.stale.length) {
          logger.warn('Stale active drivers detected', { count: snap.stale.length });
        }
      })
      .catch(() => {});
  }, 60000).unref();

  logger.info('Socket.IO initialised');
  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.IO has not been initialised');
  return io;
}

// ---------------------------------------------------------------------------
// broadcast helpers
// ---------------------------------------------------------------------------
function toSocket(socketId, event, payload) {
  if (!io) return;
  io.to(socketId).emit(event, payload);
}

function toUser(userId, event, payload) {
  if (!io) return;
  io.to(ROOMS.user(userId)).emit(event, payload);
}

function toDriver(driverId, event, payload) {
  if (!io) return;
  io.to(ROOMS.driver(driverId)).emit(event, payload);
}

function toRideRoom(rideId, event, payload) {
  if (!io) return;
  io.to(ROOMS.ride(rideId)).emit(event, payload);
}

function toOperators(event, payload) {
  if (!io) return;
  io.to(ROOMS.OPERATORS).emit(event, payload);
}

function toDrivers(event, payload) {
  if (!io) return;
  io.to(ROOMS.DRIVERS).emit(event, payload);
}

function connectedSessionCount() {
  return sessions.size;
}

function sessionsByRole() {
  const out = { user: 0, driver: 0, operator: 0, admin: 0 };
  for (const identity of sessions.values()) {
    if (out[identity.role] !== undefined) out[identity.role] += 1;
  }
  return out;
}

module.exports = {
  init,
  getIo,
  ROOMS,
  EVENTS,
  toSocket,
  toUser,
  toDriver,
  toRideRoom,
  toOperators,
  toDrivers,
  connectedSessionCount,
  sessionsByRole,
};
