import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { TrackController } from './controllers/track.controller.js';
import {
  createTrackSchema,
  duplicateTrackSchema,
  reorderTracksSchema,
  setTrackEnabledSchema,
  trackFilterSchema,
  trackIdParamsSchema,
  updateTrackSchema,
} from './validators/track.validators.js';

const controller = new TrackController();

/** §7.2: any signed-in portal role reads the catalogue; MANAGER/CONTENT_MANAGER/ADMIN write it. */
export function createTracksRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ query: trackFilterSchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.post(
    '/',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ body: createTrackSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  // Static-segment routes registered before `/:id` — Express matches
  // `/:id` greedily against any single path segment, including `reorder`.
  router.patch(
    '/reorder',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ body: reorderTracksSchema }),
    (req, res, next) => {
      controller.reorder(req, res).catch(next);
    },
  );

  router.get('/:id', validate({ params: trackIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.patch(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: trackIdParamsSchema, body: updateTrackSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/enabled',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: trackIdParamsSchema, body: setTrackEnabledSchema }),
    (req, res, next) => {
      controller.setEnabled(req, res).catch(next);
    },
  );

  router.post(
    '/:id/duplicate',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: trackIdParamsSchema, body: duplicateTrackSchema }),
    (req, res, next) => {
      controller.duplicate(req, res).catch(next);
    },
  );

  return router;
}
