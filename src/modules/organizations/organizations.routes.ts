import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { OrganizationController } from './controllers/organization.controller.js';
import { updateOrganizationSchema } from './validators/organization.validators.js';

const controller = new OrganizationController();

/** Org profile (name, default language) — MANAGER/ADMIN can read and edit their own org; HR/CONTENT_MANAGER read-only. */
export function createOrganizationsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/me', (req, res, next) => {
    controller.getOwn(req, res).catch(next);
  });

  router.patch(
    '/me',
    authorize('MANAGER', 'ADMIN'),
    validate({ body: updateOrganizationSchema }),
    (req, res, next) => {
      controller.updateOwn(req, res).catch(next);
    },
  );

  return router;
}
