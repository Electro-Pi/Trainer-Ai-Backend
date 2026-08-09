import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { AnalyticsController } from './controllers/analytics.controller.js';
import {
  contentUsageQuerySchema,
  exportQuerySchema,
  learnerIdParamsSchema,
  teamIdParamsSchema,
  trendsQuerySchema,
} from './validators/analytics.validators.js';

const controller = new AnalyticsController();
const READ_ROLES = ['MANAGER', 'HR', 'ADMIN', 'CONTENT_MANAGER'] as const;

async function resolveManagerIdByTeamParam(req: {
  params: { teamId?: string };
}): Promise<string | null> {
  const teamId = req.params.teamId;
  if (!teamId) return null;
  const team = await teamRepository.findByIdScoped(teamId);
  return team?.managerId ?? null;
}

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

/** §7.2: a MANAGER reaches only their own team's analytics; HR reads org-wide, read-only (`AU-05`, `PF-02`); ADMIN reaches everything. */
export function createAnalyticsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get(
    '/team/:teamId/performance',
    authorize(...READ_ROLES),
    validate({ params: teamIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByTeamParam),
    (req, res, next) => {
      controller.teamPerformance(req, res).catch(next);
    },
  );

  router.get('/organization/performance', authorize('HR', 'ADMIN'), (req, res, next) => {
    controller.organizationPerformance(req, res).catch(next);
  });

  router.get(
    '/learners/:id/skills',
    authorize(...READ_ROLES),
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearnerParam),
    (req, res, next) => {
      controller.learnerSkills(req, res).catch(next);
    },
  );

  router.get(
    '/trends',
    authorize(...READ_ROLES),
    validate({ query: trendsQuerySchema }),
    (req, res, next) => {
      controller.trends(req, res).catch(next);
    },
  );

  router.get(
    '/content-usage',
    authorize(...READ_ROLES),
    validate({ query: contentUsageQuerySchema }),
    (req, res, next) => {
      controller.contentUsage(req, res).catch(next);
    },
  );

  router.get(
    '/export',
    authorize('HR', 'ADMIN'),
    validate({ query: exportQuerySchema }),
    (req, res, next) => {
      controller.export(req, res).catch(next);
    },
  );

  return router;
}
