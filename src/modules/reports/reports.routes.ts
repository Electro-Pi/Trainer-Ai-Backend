import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { ReportController } from './controllers/report.controller.js';
import { resolveManagerIdByReport } from './services/report.service.js';
import { reportIdParamsSchema, reportListQuerySchema } from './validators/report.validators.js';

const controller = new ReportController();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

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

  router.get('/', validate({ query: reportListQuerySchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

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
