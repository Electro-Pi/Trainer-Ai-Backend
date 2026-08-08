import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { OutcomeController } from './controllers/outcome.controller.js';
import {
  createOutcomeSchema,
  levelIdParamsSchema,
  outcomeIdParamsSchema,
  reorderOutcomesSchema,
  setOutcomeEnabledSchema,
  updateOutcomeSchema,
} from './validators/outcome.validators.js';

const controller = new OutcomeController();

/** Nested under `/levels/:levelId/outcomes` (§7.1) — list + create + reorder-within-level. */
export function createLevelOutcomesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ params: levelIdParamsSchema }), (req, res, next) => {
    controller.listByLevel(req, res).catch(next);
  });

  router.post(
    '/',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: levelIdParamsSchema, body: createOutcomeSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.patch(
    '/reorder',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: levelIdParamsSchema, body: reorderOutcomesSchema }),
    (req, res, next) => {
      controller.reorder(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/outcomes/:id` (§7.1) — read/update/enable a single outcome by id. */
export function createOutcomesRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/:id', validate({ params: outcomeIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.patch(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: outcomeIdParamsSchema, body: updateOutcomeSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/enabled',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: outcomeIdParamsSchema, body: setOutcomeEnabledSchema }),
    (req, res, next) => {
      controller.setEnabled(req, res).catch(next);
    },
  );

  return router;
}
