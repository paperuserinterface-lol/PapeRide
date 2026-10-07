'use strict';

/**
 * TBRide :: process entrypoint.
 *
 *   PostgreSQL  ->  Node.js + Express  ->  Socket.IO  ->  vanilla JS client
 *
 * Start with:  npm start        (node server.js)
 * Develop with: npm run dev     (node --watch server.js)
 */

const http = require('http');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db');
const { createApp } = require('./http/app');
const socketServer = require('./realtime/io');
const systemLogs = require('./repositories/logs.repository');

async function start() {
  logger.info(`Starting ${config.app.name} (${config.env})`);

  // 1. Verify PostgreSQL before accepting traffic.
  try {
    const info = await db.verifyConnection();
    logger.info('PostgreSQL connected', { database: info.db, version: info.version.split(' ').slice(0, 2).join(' ') });
  } catch (err) {
    logger.error('PostgreSQL connection failed', { error: err.message });
    logger.error('Check DATABASE_URL in .env and run: psql -U postgres -d tbride_db -f schema.sql');
    process.exit(1);
  }

  // 2. HTTP + static frontend.
  const app = createApp();
  const server = http.createServer(app);

  // 3. Socket.IO on the same port.
  socketServer.init(server);

  server.listen(config.app.port, config.app.host, () => {
    logger.info(`HTTP + Socket.IO listening on http://${config.app.host}:${config.app.port}`);
    logger.info(`Frontend: http://localhost:${config.app.port}/`);
    systemLogs.log({
      actorRole: 'system',
      event: 'server.started',
      level: 'info',
      details: { port: config.app.port, env: config.env, node: process.version },
    });
  });

  // 4. Graceful shutdown so pooled connections are always released.
  const shutdown = async (signal) => {
    logger.warn(`${signal} received, shutting down`);
    server.close(async () => {
      await systemLogs.log({ actorRole: 'system', event: 'server.stopped', details: { signal } });
      await systemLogs.drain();
      await db.closePool();
      process.exit(0);
    });
    // Hard stop if sockets keep the process alive.
    setTimeout(() => {
      logger.error('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: reason instanceof Error ? reason.message : reason });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });
}

start();

module.exports = { start };
