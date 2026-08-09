import { openApiRegistry } from '@/swagger/swagger.js';

import { SessionContentRepository } from './repositories/session-content.repository.js';
import { SessionOutcomeRepository } from './repositories/session-outcome.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { createRsvpWebhookRouter, createSessionsRouter } from './sessions.routes.js';

export type { Session } from './repositories/session.repository.js';
export type { Invitation } from './repositories/invitation.repository.js';
export type { SessionContent } from './repositories/session-content.repository.js';
export { SessionService } from './services/session.service.js';

export const sessionsRouter = createSessionsRouter();
export const rsvpWebhookRouter = createRsvpWebhookRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `training-plans`
// creates/reads sessions through these instead of deep-importing
// `modules/sessions/repositories/*`.
export const sessionRepository = new SessionRepository();
export const sessionOutcomeRepository = new SessionOutcomeRepository();
export const sessionContentRepository = new SessionContentRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/sessions',
  tags: ['Sessions'],
  summary: 'Lists sessions, filterable by learner/team/status/date range',
  responses: { 200: { description: 'Session list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/sessions/calendar',
  tags: ['Sessions'],
  summary: 'Calendar view of sessions across a date range (`TP-08`)',
  responses: { 200: { description: 'Session list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/sessions/{id}',
  tags: ['Sessions'],
  summary: 'Gets a session by id',
  responses: { 200: { description: 'Session' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/sessions/{id}/reschedule',
  tags: ['Sessions'],
  summary: 'Reschedules a session, updating its Teams meeting if one exists (`TP-06`)',
  responses: { 200: { description: 'Rescheduled session' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/sessions/{id}/cancel',
  tags: ['Sessions'],
  summary: 'Cancels a session and its Teams meeting',
  responses: { 200: { description: 'Cancelled session' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/sessions/{id}/invitation',
  tags: ['Sessions'],
  summary: 'Gets a session’s invitation and RSVP/attendance state',
  responses: { 200: { description: 'Invitation' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/sessions/{id}/invitation/resend',
  tags: ['Sessions'],
  summary: 'Resends a session invitation (`IV-02`)',
  responses: { 200: { description: 'Invitation' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/webhooks/graph/rsvp',
  tags: ['Sessions'],
  summary: '🌐 Public — Graph change-notification receiver for meeting RSVP capture (`IV-03`)',
  responses: { 202: { description: 'Accepted' } },
});
