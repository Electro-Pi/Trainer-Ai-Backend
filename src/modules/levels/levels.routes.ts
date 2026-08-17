import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { LevelController } from './controllers/level.controller.js';
import {
  createLevelSchema,
  levelIdParamsSchema,
  reorderLevelsSchema,
  setLevelEnabledSchema,
  trackIdParamsSchema,
  updateLevelSchema,
} from './validators/level.validators.js';

const controller = new LevelController();

/** Nested under `/tracks/:trackId/levels` (§7.1) — list + create + reorder-within-track. */
export function createTrackLevelsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ params: trackIdParamsSchema }), (req, res, next) => {
    controller.listByTrack(req, res).catch(next);
  });

  router.post(
    '/',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: trackIdParamsSchema, body: createLevelSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.patch(
    '/reorder',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: trackIdParamsSchema, body: reorderLevelsSchema }),
    (req, res, next) => {
      controller.reorder(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/levels/:id` (§7.1) — read/update/enable a single level by id. */
export function createLevelsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/:id', validate({ params: levelIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.patch(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: levelIdParamsSchema, body: updateLevelSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/enabled',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: levelIdParamsSchema, body: setLevelEnabledSchema }),
    (req, res, next) => {
      controller.setEnabled(req, res).catch(next);
    },
  );

  router.delete(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: levelIdParamsSchema }),
    (req, res, next) => {
      controller.delete(req, res).catch(next);
    },
  );

  return router;
}
