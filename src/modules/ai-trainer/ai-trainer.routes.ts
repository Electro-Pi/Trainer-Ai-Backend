import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { AiTrainerController } from './controllers/ai-trainer.controller.js';
import { ExternalSessionController } from './controllers/external-session.controller.js';
import {
  externalSessionIdParamsSchema,
  generateTrackSlidesSchema,
  skillIdParamsSchema,
  startExternalSessionSchema,
  suggestDraftSkillOutcomesSchema,
  suggestDraftTrackSkillsSchema,
  suggestSkillOutcomesSchema,
  suggestTrackSkillsSchema,
  trackIdParamsSchema,
} from './validators/ai-trainer.validators.js';

const aiTrainerController = new AiTrainerController();
const externalSessionController = new ExternalSessionController();

/** Content/track-creation write roles, matching `tracks`/`skills`/`outcomes`' existing convention. */
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'CONTENT_CREATOR', 'ADMIN'] as const;
/** Learner-session reads — no CONTENT_CREATOR (§7.2). */
const READ_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

/**
 * Nested under `/tracks/:trackId` — `POST .../slides` (blocking slide-deck
 * generation) and `POST .../recommendations/skills` (stateless advisory).
 * `mergeParams: true` so `req.params.trackId` from the parent `/tracks`
 * mount is visible here, same as `outcomes`' `createLevelOutcomesRouter`.
 */
export function createTrackAiTrainerRouter(): Router {
  const router = Router({ mergeParams: true });

  router.use(authenticate(), tenantScope());

  router.post(
    '/slides',
    authorize(...WRITE_ROLES),
    validate({ params: trackIdParamsSchema, body: generateTrackSlidesSchema }),
    (req, res, next) => {
      aiTrainerController.generateTrackSlides(req, res).catch(next);
    },
  );

  router.post(
    '/recommendations/skills',
    authorize(...WRITE_ROLES),
    validate({ params: trackIdParamsSchema, body: suggestTrackSkillsSchema }),
    (req, res, next) => {
      aiTrainerController.suggestTrackSkills(req, res).catch(next);
    },
  );

  return router;
}

/** Nested under `/skills/:skillId` — `POST .../recommendations/outcomes`, stateless advisory. */
export function createSkillAiTrainerRouter(): Router {
  const router = Router({ mergeParams: true });

  router.use(authenticate(), tenantScope());

  router.post(
    '/recommendations/outcomes',
    authorize(...WRITE_ROLES),
    validate({ params: skillIdParamsSchema, body: suggestSkillOutcomesSchema }),
    (req, res, next) => {
      aiTrainerController.suggestSkillOutcomes(req, res).catch(next);
    },
  );

  return router;
}

/**
 * Flat `/ai-trainer` — draft-mode advisory suggestions for the track-creation
 * wizard, before the track/skill being composed has a real id. No DB lookup;
 * the caller's typed track/skill name goes straight to the AI service.
 */
export function createDraftAiTrainerRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.post(
    '/recommendations/skills',
    authorize(...WRITE_ROLES),
    validate({ body: suggestDraftTrackSkillsSchema }),
    (req, res, next) => {
      aiTrainerController.suggestDraftTrackSkills(req, res).catch(next);
    },
  );

  router.post(
    '/recommendations/outcomes',
    authorize(...WRITE_ROLES),
    validate({ body: suggestDraftSkillOutcomesSchema }),
    (req, res, next) => {
      aiTrainerController.suggestDraftSkillOutcomes(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/external-sessions` — start + poll a live AI-trainer-bot session. */
export function createExternalSessionsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.post(
    '/',
    authorize(...WRITE_ROLES),
    validate({ body: startExternalSessionSchema }),
    (req, res, next) => {
      externalSessionController.start(req, res).catch(next);
    },
  );

  // Live status/transcript/evaluation of a learner's session. These carry
  // learner data, so they need at least a role gate — they had none, leaving
  // them open to any authenticated principal. Ownership is not checked here:
  // the id is the AI Trainer's own `externalSessionId`, which does not
  // resolve to a team through `requireTeamAccess`'s session-id contract.
  // Narrowing these to the owning manager needs an
  // externalSessionId -> Session -> learner -> team lookup; flagged rather
  // than guessed, since it changes who can watch a running session.
  router.get(
    '/:id',
    authorize(...READ_ROLES),
    validate({ params: externalSessionIdParamsSchema }),
    (req, res, next) => {
      externalSessionController.getStatus(req, res).catch(next);
    },
  );

  router.get(
    '/:id/transcript',
    authorize(...READ_ROLES),
    validate({ params: externalSessionIdParamsSchema }),
    (req, res, next) => {
      externalSessionController.getTranscript(req, res).catch(next);
    },
  );

  router.get(
    '/:id/evaluation',
    authorize(...READ_ROLES),
    validate({ params: externalSessionIdParamsSchema }),
    (req, res, next) => {
      externalSessionController.getEvaluation(req, res).catch(next);
    },
  );

  return router;
}
