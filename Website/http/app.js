'use strict';

/**
 * TBRide :: Express application factory.
 * Plain Node.js + Express. No frontend framework, no build step: the files in
 * /public are served exactly as authored.
 */

const path = require('path');
const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const { toPublicError } = require('../utils/errors');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const telegramRoutes = require('./routes/telegram.routes');
const driverApplicationRoutes = require('./routes/driver-applications.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // CORS (configurable, "*" by default for local development).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();
    if (config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    return next();
  });

  app.options(/.*/, (_req, res) => res.sendStatus(204));

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false }));

  // Request log (skip the health probe noise).
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') logger.debug('HTTP request', { method: req.method, path: req.path });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).end();
  });

  // The static frontend MUST be plain HTML/CSS/JS served from /public.
  app.use(express.static(path.join(__dirname, '../public'), { extensions: ['html'], index: 'index.html' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/telegram', telegramRoutes);
  app.use('/api/driver-applications', driverApplicationRoutes);

  app.use('/api', authRoutes); // /api/health, /api/drivers, /api/rides, ...

  // Unknown API paths stay JSON 404s; other GET paths use the frontend shell.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } });
    }
    return next();
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  // Central error handler: internal details never reach the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const publicError = toPublicError(err);
    if (publicError.statusCode >= 500) {
      logger.error('Unhandled HTTP error', { error: err && err.message, stack: err && err.stack });
    } else {
      logger.warn('HTTP error', { code: publicError.code, message: publicError.message, path: req.path });
    }
    res.status(publicError.statusCode).json({
      error: {
        code: publicError.code,
        message: publicError.message,
        details: publicError.details || undefined,
      },
    });
  });

  return app;
}

module.exports = { createApp };
