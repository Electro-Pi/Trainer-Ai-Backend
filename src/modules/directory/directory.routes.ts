import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { DirectoryController } from './controllers/directory.controller.js';
import {
  directoryGroupIdParamsSchema,
  directorySearchFilterSchema,
} from './validators/directory.validators.js';

const controller = new DirectoryController();

/** `TM-01`, `TM-06` — team-building lookups, so MANAGER (own team) + ADMIN only. */
export function createDirectoryRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope(), authorize('MANAGER', 'ADMIN'));

  router.get('/search', validate({ query: directorySearchFilterSchema }), (req, res, next) => {
    controller.search(req, res).catch(next);
  });

  router.get(
    '/groups/:id/members',
    validate({ params: directoryGroupIdParamsSchema }),
    (req, res, next) => {
      controller.groupMembers(req, res).catch(next);
    },
  );

  return router;
}
