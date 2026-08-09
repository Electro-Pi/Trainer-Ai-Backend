import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { TrainingPlanController } from './controllers/training-plan.controller.js';
import { TrainingPlanRepository } from './repositories/training-plan.repository.js';
import {
  createTrainingPlanSchema,
  planIdParamsSchema,
  planTemplateQuerySchema,
  savePlanTemplateSchema,
  suggestPlanSchema,
  updateTrainingPlanSchema,
} from './validators/training-plan.validators.js';

const controller = new TrainingPlanController();
const plansRepo = new TrainingPlanRepository();
const WRITE_ROLES = ['MANAGER', 'ADMIN'] as const;

async function resolveManagerIdByLearnerInBody(req: {
  body: { learnerId?: string };
}): Promise<string | null> {
  const learnerId = req.body.learnerId;
  if (!learnerId) return null;
  const learner = await learnerRepository.findByIdScoped(learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

async function resolveManagerIdByPlan(req: { params: { id?: string } }): Promise<string | null> {
  const planId = req.params.id;
  if (!planId) return null;
  const plan = await plansRepo.findByIdScoped(planId);
  if (!plan) return null;
  const learner = await learnerRepository.findByIdScoped(plan.learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

export function createTrainingPlansRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.post(
    '/',
    authorize(...WRITE_ROLES),
    validate({ body: createTrainingPlanSchema }),
    requireTeamAccess(resolveManagerIdByLearnerInBody),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.get('/templates', validate({ query: planTemplateQuerySchema }), (req, res, next) => {
    controller.listTemplates(req, res).catch(next);
  });

  router.get(
    '/:id',
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.getById(req, res).catch(next);
    },
  );

  router.patch(
    '/:id',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema, body: updateTrainingPlanSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.post(
    '/:id/suggest',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema, body: suggestPlanSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.suggest(req, res).catch(next);
    },
  );

  router.get(
    '/:id/coverage',
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.coverage(req, res).catch(next);
    },
  );

  router.post(
    '/:id/confirm',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.confirm(req, res).catch(next);
    },
  );

  router.post(
    '/:id/cancel',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.cancel(req, res).catch(next);
    },
  );

  router.post(
    '/:id/save-as-template',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema, body: savePlanTemplateSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.saveAsTemplate(req, res).catch(next);
    },
  );

  return router;
}
