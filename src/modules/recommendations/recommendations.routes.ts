import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { RecommendationController } from './controllers/recommendation.controller.js';
import {
  itemActionSchema,
  learnerIdParamsSchema,
  recommendationIdParamsSchema,
  recommendationItemParamsSchema,
} from './validators/recommendation.validators.js';

const controller = new RecommendationController();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

async function resolveManagerIdByLearner(req: { params: { id?: string } }): Promise<string | null> {
  const learnerId = req.params.id;
  if (!learnerId) return null;
  const learner = await learnerRepository.findByIdScoped(learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

/** `POST /learners/:id/recommendations` — mounted at `/learners` alongside `learnersRouter` (same split pattern as `teams`/`teamMembers`). */
export function createLearnerRecommendationsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.post(
    '/:id/recommendations',
    authorize(...WRITE_ROLES),
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      controller.generate(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/recommendations/:id` surface — ownership is checked inside the service via tenant scoping, not `requireTeamAccess`, since a recommendation has no `teamId` of its own to resolve a manager from without an extra join. */
export function createRecommendationsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/:id', validate({ params: recommendationIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.post(
    '/:id/confirm',
    authorize(...WRITE_ROLES),
    validate({ params: recommendationIdParamsSchema }),
    (req, res, next) => {
      controller.confirm(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/items/:itemId',
    authorize(...WRITE_ROLES),
    validate({ params: recommendationItemParamsSchema, body: itemActionSchema }),
    (req, res, next) => {
      controller.applyItemAction(req, res).catch(next);
    },
  );

  return router;
}
