import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { mediaUpload } from '@/modules/content/middleware/media-upload.middleware.js';
import { learnerIdParamsSchema, learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { PlanSnapshotController } from './controllers/plan-snapshot.controller.js';
import { TrainingPlanController } from './controllers/training-plan.controller.js';
import { TrainingPlanRepository } from './repositories/training-plan.repository.js';
import {
  addPlanContentSnapshotSchema,
  addPlanOutcomeSnapshotSchema,
  addPlanSkillSnapshotSchema,
  contentSnapshotIdParamsSchema,
  outcomeSnapshotIdParamsSchema,
  skillSnapshotIdParamsSchema,
  updatePlanContentSnapshotSchema,
  updatePlanOutcomeSnapshotSchema,
  updatePlanSkillSnapshotSchema,
} from './validators/plan-snapshot.validators.js';
import {
  createTrainingPlanSchema,
  planIdParamsSchema,
  planTemplateQuerySchema,
  savePlanTemplateSchema,
  suggestPlanSchema,
  updateTrainingPlanSchema,
} from './validators/training-plan.validators.js';

const controller = new TrainingPlanController();
const snapshotController = new PlanSnapshotController();
const plansRepo = new TrainingPlanRepository();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

async function resolveManagerIdByLearnerParam(req: {
  params: { id?: string };
}): Promise<string | null> {
  const learnerId = req.params.id;
  if (!learnerId) return null;
  const learner = await learnerRepository.findByIdScoped(learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

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

  // ── Plan-scoped catalogue snapshot (wizard step2) ──────────────────────
  router.post(
    '/:id/snapshot',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.create(req, res).catch(next);
    },
  );

  router.get(
    '/:id/snapshot',
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.getTree(req, res).catch(next);
    },
  );

  router.post(
    '/:id/snapshot/skills',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema, body: addPlanSkillSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.addSkill(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/snapshot/skills/:skillSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: skillSnapshotIdParamsSchema, body: updatePlanSkillSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.updateSkill(req, res).catch(next);
    },
  );

  router.delete(
    '/:id/snapshot/skills/:skillSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: skillSnapshotIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.removeSkill(req, res).catch(next);
    },
  );

  router.post(
    '/:id/snapshot/skills/:skillSnapshotId/outcomes',
    authorize(...WRITE_ROLES),
    validate({ params: skillSnapshotIdParamsSchema, body: addPlanOutcomeSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.addOutcome(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/snapshot/outcomes/:outcomeSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: outcomeSnapshotIdParamsSchema, body: updatePlanOutcomeSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.updateOutcome(req, res).catch(next);
    },
  );

  router.delete(
    '/:id/snapshot/outcomes/:outcomeSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: outcomeSnapshotIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.removeOutcome(req, res).catch(next);
    },
  );

  router.post(
    '/:id/snapshot/content',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema, body: addPlanContentSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.addContent(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/snapshot/content/:contentSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: contentSnapshotIdParamsSchema, body: updatePlanContentSnapshotSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.updateContent(req, res).catch(next);
    },
  );

  router.delete(
    '/:id/snapshot/content/:contentSnapshotId',
    authorize(...WRITE_ROLES),
    validate({ params: contentSnapshotIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.removeContent(req, res).catch(next);
    },
  );

  router.get(
    '/:id/snapshot/content/:contentSnapshotId/media',
    validate({ params: contentSnapshotIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      snapshotController.listMedia(req, res).catch(next);
    },
  );

  router.post(
    '/:id/snapshot/content/:contentSnapshotId/media',
    authorize(...WRITE_ROLES),
    validate({ params: contentSnapshotIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      mediaUpload(req, res, next);
    },
    (req, res, next) => {
      snapshotController.uploadMedia(req, res).catch(next);
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

  router.post(
    '/:id/summary-report',
    authorize(...WRITE_ROLES),
    validate({ params: planIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByPlan),
    (req, res, next) => {
      controller.summaryReport(req, res).catch(next);
    },
  );

  return router;
}

/**
 * Mounted under `/learners` alongside `learnersRouter` (same pattern as
 * `recommendations.module.ts`'s `learnerRecommendationsRouter`) — kept out of
 * `learners.routes.ts` itself so that module never has to import back into
 * `training-plans`, which would close a cycle through `sessions.module.ts`
 * (training-plans → sessions already exists for `SessionService`) and race
 * the two modules' top-level singleton initialization.
 */
export function createLearnerActivePlanRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get(
    '/:id/active-plan',
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearnerParam),
    (req, res, next) => {
      controller.getActiveByLearner(req, res).catch(next);
    },
  );

  return router;
}
