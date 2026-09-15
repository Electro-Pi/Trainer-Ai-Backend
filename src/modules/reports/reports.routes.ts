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

import { ReportController } from './controllers/report.controller.js';
import { resolveManagerIdByReport } from './services/report.service.js';
import { reportIdParamsSchema, reportListQuerySchema } from './validators/report.validators.js';

const controller = new ReportController();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

/**
 * Reports are learner data. Per ARCHITECTURE §7.2 a CONTENT_CREATOR manages
 * the content catalogue and has no learner visibility at all, so it is absent
 * here — the role gate below is what stops it reaching `/portal/reports` by
 * typing the URL.
 */
const READ_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const teams = await teamRepository.findByManager(managerId);
  return teams.map((team) => team.id);
}

async function resolveManagerIdForReportParam(req: {
  params: { id?: string };
}): Promise<string | null> {
  const reportId = req.params.id;
  if (!reportId) return null;
  return resolveManagerIdByReport(reportId);
}

export function createReportsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  // `GET /` had no role gate and no ownership filter: `tenantScope()` alone
  // narrows to the organization, so every signed-in user — including a
  // CONTENT_CREATOR with no Reports tab in their sidebar — could read every
  // learner's report in the org by requesting this directly. The other two
  // routes below were already guarded by `requireTeamAccess`; a collection
  // has no single id for that guard to resolve, which is why it was missed.
  router.get(
    '/',
    validate({ query: reportListQuerySchema }),
    requireTeamScopedList(resolveManagedTeamIds, READ_ROLES),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    },
  );

  router.get(
    '/:id',
    validate({ params: reportIdParamsSchema }),
    requireTeamAccess(resolveManagerIdForReportParam),
    (req, res, next) => {
      controller.getById(req, res).catch(next);
    },
  );

  router.post(
    '/:id/resend',
    authorize(...WRITE_ROLES),
    validate({ params: reportIdParamsSchema }),
    requireTeamAccess(resolveManagerIdForReportParam),
    (req, res, next) => {
      controller.resend(req, res).catch(next);
    },
  );

  return router;
}
