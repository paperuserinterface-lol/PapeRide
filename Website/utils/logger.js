'use strict';

const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.log.level] || LEVELS.info;

function serialize(meta) {
  if (meta === undefined || meta === null) return '';
  if (meta instanceof Error) return meta.stack || meta.message;
  if (typeof meta === 'object') {
    try {
      return JSON.stringify(meta);
    } catch (_) {
      return '[unserializable]';
    }
  }
  return String(meta);
}

function emit(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase().padEnd(5)}] ${message}`;
  const extra = serialize(meta);
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(extra ? `${line} ${extra}` : line);
}

module.exports = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};
