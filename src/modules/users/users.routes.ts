import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { PortalUserController } from './controllers/portal-user.controller.js';
import {
  createPortalUserSchema,
  portalUserFilterSchema,
  portalUserIdParamsSchema,
  updatePortalUserSchema,
} from './validators/portal-user.validators.js';

const controller = new PortalUserController();

/** Role management is ADMIN-only (§7.2 has no CRUD row for portal users beyond implicit admin ownership). */
export function createUsersRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope(), authorize('ADMIN'));

  router.get('/', validate({ query: portalUserFilterSchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.get('/:id', validate({ params: portalUserIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.post('/', validate({ body: createPortalUserSchema }), (req, res, next) => {
    controller.create(req, res).catch(next);
  });

  router.patch(
    '/:id',
    validate({ params: portalUserIdParamsSchema, body: updatePortalUserSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.post(
    '/:id/deactivate',
    validate({ params: portalUserIdParamsSchema }),
    (req, res, next) => {
      controller.deactivate(req, res).catch(next);
    },
  );

  return router;
}
