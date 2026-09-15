import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import {
  authorize,
  requireTeamAccess,
  requireTeamScopedList,
} from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { RsvpWebhookController } from './controllers/rsvp-webhook.controller.js';
import { SessionController } from './controllers/session.controller.js';
import { SessionService } from './services/session.service.js';
import {
  calendarQuerySchema,
  rescheduleSessionSchema,
  sessionIdParamsSchema,
  sessionListQuerySchema,
} from './validators/session.validators.js';

const controller = new SessionController();
const rsvpWebhookController = new RsvpWebhookController();
const sessionService = new SessionService();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

/**
 * Sessions are learner data — a CONTENT_CREATOR has no learner visibility
 * (ARCHITECTURE §7.2), so it is deliberately absent.
 */
const READ_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const teams = await teamRepository.findByManager(managerId);
  return teams.map((team) => team.id);
}

async function resolveManagerIdBySession(req: { params: { id?: string } }): Promise<string | null> {
  const sessionId = req.params.id;
  if (!sessionId) return null;
  return sessionService.resolveManagerId(sessionId);
}

export function createSessionsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  // Both collections had no role gate and no ownership filter: the `teamId`
  // query param is a client-chosen FILTER, not a guard, so omitting it
  // returned every session in the organization to any signed-in user. The
  // `/:id` routes below were already covered by `requireTeamAccess`, which
  // cannot apply to a list (no single id to resolve).
  router.get(
    '/',
    validate({ query: sessionListQuerySchema }),
    requireTeamScopedList(resolveManagedTeamIds, READ_ROLES),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    },
  );

  router.get(
    '/calendar',
    validate({ query: calendarQuerySchema }),
    requireTeamScopedList(resolveManagedTeamIds, READ_ROLES),
    (req, res, next) => {
      controller.calendar(req, res).catch(next);
    },
  );

  router.get(
    '/:id',
    validate({ params: sessionIdParamsSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.getById(req, res).catch(next);
    },
  );

  router.post(
    '/:id/reschedule',
    authorize(...WRITE_ROLES),
    validate({ params: sessionIdParamsSchema, body: rescheduleSessionSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.reschedule(req, res).catch(next);
    },
  );

  router.post(
    '/:id/cancel',
    authorize(...WRITE_ROLES),
    validate({ params: sessionIdParamsSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.cancel(req, res).catch(next);
    },
  );

  router.get(
    '/:id/transcript',
    validate({ params: sessionIdParamsSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.getTranscript(req, res).catch(next);
    },
  );

  router.get(
    '/:id/invitation',
    validate({ params: sessionIdParamsSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.getInvitation(req, res).catch(next);
    },
  );

  router.post(
    '/:id/invitation/resend',
    authorize(...WRITE_ROLES),
    validate({ params: sessionIdParamsSchema }),
    requireTeamAccess(resolveManagerIdBySession),
    (req, res, next) => {
      controller.resendInvitation(req, res).catch(next);
    },
  );

  return router;
}

/** 🌐 Public — Graph calls this directly, no bearer token exists on their side (`IV-03`). Mounted outside `/api/v1`'s authenticated routers. */
export function createRsvpWebhookRouter(): Router {
  const router = Router();

  router.post('/graph/rsvp', (req, res, next) => {
    rsvpWebhookController.receive(req, res).catch(next);
  });

  return router;
}
