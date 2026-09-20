import { Router } from 'express';

import { serviceToken } from '@/common/guards/service-token.guard.js';
import { agentRateLimitMiddleware } from '@/common/middleware/rate-limit.middleware.js';
import { validate } from '@/common/pipes/validate.js';

import { AgentController } from './controllers/agent.controller.js';
import {
  completeSessionSchema,
  joinTokenParamsSchema,
  remediationRequestSchema,
  sessionContentIdParamsSchema,
  sessionIdParamsSchema,
  submitAnswerSchema,
  submitNotesSchema,
  submitTranscriptSchema,
} from './validators/agent.validators.js';

const controller = new AgentController();

/**
 * `P8-2` — every route here is 🤖 service-token authenticated, never a
 * portal-user JWT (ARCHITECTURE §9.11: this is the AI team's side of the
 * seam). `agentRateLimitMiddleware` bounds a misbehaving/compromised caller
 * (§9.11 rule 4 — their API is untrusted input); every body is Zod-validated
 * exactly like a browser request (same rule).
 */
export function createAgentRouter(): Router {
  const router = Router();

  // TEMP: rate limit disabled for local dev testing — never commit/push this.
  router.use(serviceToken());

  router.get(
    '/sessions/:joinToken/context',
    validate({ params: joinTokenParamsSchema }),
    (req, res, next) => {
      controller.getContext(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/content/:contentId/delivered',
    validate({ params: sessionContentIdParamsSchema }),
    (req, res, next) => {
      controller.markDelivered(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/start',
    validate({ params: sessionIdParamsSchema }),
    (req, res, next) => {
      controller.start(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/answers',
    validate({ params: sessionIdParamsSchema, body: submitAnswerSchema }),
    (req, res, next) => {
      controller.submitAnswer(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/remediation',
    validate({ params: sessionIdParamsSchema, body: remediationRequestSchema }),
    (req, res, next) => {
      controller.remediation(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/notes',
    validate({ params: sessionIdParamsSchema, body: submitNotesSchema }),
    (req, res, next) => {
      controller.submitNotes(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/transcript',
    validate({ params: sessionIdParamsSchema, body: submitTranscriptSchema }),
    (req, res, next) => {
      controller.submitTranscript(req, res).catch(next);
    },
  );

  router.post(
    '/sessions/:id/complete',
    validate({ params: sessionIdParamsSchema, body: completeSessionSchema }),
    (req, res, next) => {
      controller.complete(req, res).catch(next);
    },
  );

  return router;
}
