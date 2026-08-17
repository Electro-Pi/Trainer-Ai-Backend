import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { PortalInviteController } from './controllers/portal-invite.controller.js';
import {
  createPortalInviteSchema,
  portalInviteIdParamsSchema,
} from './validators/portal-invite.validators.js';

const controller = new PortalInviteController();

/** Onboarding invites are ADMIN-only, same convention as the `users` module. */
export function createInvitesRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope(), authorize('ADMIN'));

  router.get('/', (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.post('/', validate({ body: createPortalInviteSchema }), (req, res, next) => {
    controller.create(req, res).catch(next);
  });

  router.post('/:id/revoke', validate({ params: portalInviteIdParamsSchema }), (req, res, next) => {
    controller.revoke(req, res).catch(next);
  });

  return router;
}
