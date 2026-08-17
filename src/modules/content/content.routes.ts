import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { ContentController } from './controllers/content.controller.js';
import { MediaController } from './controllers/media.controller.js';
import { mediaUpload } from './middleware/media-upload.middleware.js';
import {
  bulkCreateContentSchema,
  bulkMetadataEditSchema,
  contentFilterSchema,
  contentIdParamsSchema,
  contentSearchQuerySchema,
  createContentSchema,
  mediaIdParamsSchema,
  updateContentSchema,
} from './validators/content.validators.js';

const controller = new ContentController();
const mediaController = new MediaController();
const WRITE_ROLES = ['DEPARTMENT_MANAGER', 'CONTENT_CREATOR', 'ADMIN'] as const;

/** §7.2: any signed-in portal role reads the catalogue; MANAGER/CONTENT_MANAGER/ADMIN write it. */
export function createContentRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ query: contentFilterSchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.post(
    '/',
    authorize(...WRITE_ROLES),
    validate({ body: createContentSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  // Static-segment routes registered before `/:id` — Express matches `/:id`
  // greedily against any single path segment, including `bulk`/`bulk-metadata`.
  router.post(
    '/bulk',
    authorize(...WRITE_ROLES),
    validate({ body: bulkCreateContentSchema }),
    (req, res, next) => {
      controller.bulkCreate(req, res).catch(next);
    },
  );

  router.patch(
    '/bulk-metadata',
    authorize(...WRITE_ROLES),
    validate({ body: bulkMetadataEditSchema }),
    (req, res, next) => {
      controller.bulkMetadataEdit(req, res).catch(next);
    },
  );

  router.get('/coverage', (req, res, next) => {
    controller.coverage(req, res).catch(next);
  });

  router.get('/search', validate({ query: contentSearchQuerySchema }), (req, res, next) => {
    controller.search(req, res).catch(next);
  });

  router.get('/:id', validate({ params: contentIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.patch(
    '/:id',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema, body: updateContentSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.post(
    '/:id/submit-review',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema }),
    (req, res, next) => {
      controller.submitForReview(req, res).catch(next);
    },
  );

  router.post(
    '/:id/publish',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema }),
    (req, res, next) => {
      controller.publish(req, res).catch(next);
    },
  );

  router.post(
    '/:id/archive',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema }),
    (req, res, next) => {
      controller.archive(req, res).catch(next);
    },
  );

  router.post(
    '/:id/new-version',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema }),
    (req, res, next) => {
      controller.newVersion(req, res).catch(next);
    },
  );

  router.get('/:id/media', validate({ params: contentIdParamsSchema }), (req, res, next) => {
    mediaController.listByContentItem(req, res).catch(next);
  });

  router.post(
    '/:id/media',
    authorize(...WRITE_ROLES),
    validate({ params: contentIdParamsSchema }),
    (req, res, next) => {
      mediaUpload(req, res, next);
    },
    (req, res, next) => {
      mediaController.upload(req, res).catch(next);
    },
  );

  return router;
}

/** Flat `/media/:id` — media deletion isn't scoped by its parent content item in the URL. */
export function createMediaRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.delete(
    '/:id',
    authorize(...WRITE_ROLES),
    validate({ params: mediaIdParamsSchema }),
    (req, res, next) => {
      mediaController.delete(req, res).catch(next);
    },
  );

  return router;
}
