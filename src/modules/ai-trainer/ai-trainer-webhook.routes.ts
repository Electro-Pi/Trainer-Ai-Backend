import { Router } from 'express';

import { validate } from '@/common/pipes/validate.js';

import { ExternalSessionCompleteController } from './controllers/external-session-complete.controller.js';
import {
  externalSessionIdParamsSchema,
  webhookSessionCompleteSchema,
} from './validators/ai-trainer.validators.js';

const controller = new ExternalSessionCompleteController();

/**
 * The AI Trainer's meeting-end webhook — a SEPARATE router from
 * `createExternalSessionsRouter()` in `ai-trainer.routes.ts` on purpose:
 * that router is `authenticate()+tenantScope()`-gated for portal-user
 * requests, while this one is the AI team calling us directly. No auth guard
 * here at all, per explicit user request — unlike the service-token-gated
 * `agent.routes.ts` seam, this endpoint is open.
 */
export function createAiTrainerWebhookRouter(): Router {
  const router = Router();

  router.post(
    '/:id/complete',
    validate({ params: externalSessionIdParamsSchema, body: webhookSessionCompleteSchema }),
    (req, res, next) => {
      controller.complete(req, res).catch(next);
    },
  );

  return router;
}
