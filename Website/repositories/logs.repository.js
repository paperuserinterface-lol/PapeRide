'use strict';

/**
 * TBRide :: system_logs repository (admin audit trail).
 *
 * Log writes are queued and flushed OUTSIDE of any caller transaction:
 *   - they can never extend or block a business transaction (audit rows carry a
 *     FK to users(id), which would otherwise wait on row locks taken by
 *     dispatch/ride transactions),
 *   - a logging failure can never roll back a ride.
 */

const { queryOne, queryMany } = require('../db');
const logger = require('../utils/logger');

const LEVELS = ['info', 'warn', 'error'];
const MAX_QUEUE = 500;

/** @type {Array<object>} */
const queue = [];
let flushing = false;
let dropped = 0;

/**
 * Queue an audit entry. Resolves immediately; the write happens on the next
 * tick on its own pooled connection.
 *
 * @param {{actorId?:string|null, actorRole?:string|null, event:string,
 *          entityId?:string|null, level?:string, details?:object}} entry
 */
function log(entry) {
  if (queue.length >= MAX_QUEUE) {
    dropped += 1;
    if (dropped % 50 === 1) logger.warn('Audit log queue full, dropping entries', { dropped });
  } else {
    queue.push({
      actorId: entry.actorId || null,
      actorRole: entry.actorRole || 'system',
      event: String(entry.event || 'event').slice(0, 64),
      entityId: entry.entityId || null,
      level: LEVELS.includes(entry.level) ? entry.level : 'info',
      details: entry.details || {},
    });
  }
  scheduleFlush();
  return Promise.resolve(null);
}

/** Synchronous variant used by services that must not await. */
function logSync(entry) {
  log(entry);
}

function scheduleFlush() {
  if (flushing) return;
  flushing = true;
  setImmediate(() => {
    flushing = false;
    flush().catch((err) => logger.warn('Audit flush crashed', { error: err.message }));
  });
}

async function flush() {
  const batch = queue.splice(0, 50);
  if (!batch.length) return;

  try {
    for (const entry of batch) {
      await queryOne(
        `INSERT INTO system_logs (actor_id, actor_role, event, entity_id, level, details)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, created_at`,
        [
          entry.actorId,
          entry.actorRole,
          entry.event,
          entry.entityId,
          entry.level,
          JSON.stringify(entry.details || {}),
        ]
      );
    }
  } catch (err) {
    logger.warn('Failed to persist system log', { error: err.message });
  }

  if (queue.length) scheduleFlush();
}

async function list({ limit = 200, level = null, event = null } = {}) {
  const clauses = [];
  const params = [];
  if (level && LEVELS.includes(level)) {
    params.push(level);
    clauses.push(`level = $${params.length}`);
  }
  if (event) {
    params.push(String(event).slice(0, 64));
    clauses.push(`event = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return queryMany(
    `SELECT l.id, l.actor_id, l.actor_role, l.event, l.entity_id, l.level, l.details, l.created_at,
            u.full_name AS actor_name
       FROM system_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       ${where}
      ORDER BY l.created_at DESC
      LIMIT ${safeLimit}`,
    params
  );
}

async function listDriverApplications(limit = 200) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  return queryMany(
    `SELECT application.id, application.actor_id, application.entity_id,
            application.details, application.created_at,
            applicant.full_name AS actor_name,
            COALESCE(decision.details->>'decision', 'pending') AS status,
            decision.created_at AS decided_at,
            decision_actor.full_name AS decided_by
       FROM system_logs application
       LEFT JOIN users applicant ON applicant.id = application.actor_id
       LEFT JOIN LATERAL (
         SELECT l.details, l.actor_id, l.created_at
           FROM system_logs l
          WHERE l.event = 'driver.application_decision'
            AND l.details->>'applicationId' = application.id::text
          ORDER BY l.id DESC
          LIMIT 1
       ) decision ON true
       LEFT JOIN users decision_actor ON decision_actor.id = decision.actor_id
      WHERE application.event = 'driver.application'
      ORDER BY application.created_at DESC, application.id DESC
      LIMIT ${safeLimit}`
  );
}

async function hasPendingDriverApplication(userId) {
  const row = await queryOne(
    `SELECT EXISTS (
       SELECT 1
         FROM system_logs application
        WHERE application.event = 'driver.application'
          AND application.actor_id = $1
          AND NOT EXISTS (
            SELECT 1
              FROM system_logs decision
             WHERE decision.event = 'driver.application_decision'
               AND decision.details->>'applicationId' = application.id::text
          )
     ) AS pending`,
    [userId]
  );
  return row.pending;
}

async function recentEvents() {
  return queryMany(
    `SELECT event, COUNT(*)::int AS total FROM system_logs GROUP BY event ORDER BY total DESC LIMIT 20`
  );
}

/** Flush pending entries before shutdown. */
async function drain() {
  while (queue.length) {
    await flush();
  }
}

module.exports = {
  log,
  logSync,
  list,
  listDriverApplications,
  hasPendingDriverApplication,
  recentEvents,
  drain,
};
