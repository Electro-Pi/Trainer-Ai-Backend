import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { SkillController } from './controllers/skill.controller.js';
import {
  createSkillSchema,
  duplicateSkillSchema,
  setSkillEnabledSchema,
  skillFilterSchema,
  skillIdParamsSchema,
  updateSkillSchema,
} from './validators/skill.validators.js';

const controller = new SkillController();

/** Any signed-in portal role reads the catalogue; MANAGER/CONTENT_MANAGER/ADMIN write it — mirrors tracks.routes.ts. */
export function createSkillsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ query: skillFilterSchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.post(
    '/',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ body: createSkillSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.get('/:id', validate({ params: skillIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.patch(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: skillIdParamsSchema, body: updateSkillSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/enabled',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: skillIdParamsSchema, body: setSkillEnabledSchema }),
    (req, res, next) => {
      controller.setEnabled(req, res).catch(next);
    },
  );

  router.post(
    '/:id/duplicate',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: skillIdParamsSchema, body: duplicateSkillSchema }),
    (req, res, next) => {
      controller.duplicate(req, res).catch(next);
    },
  );

  router.delete(
    '/:id',
    authorize('MANAGER', 'CONTENT_MANAGER', 'ADMIN'),
    validate({ params: skillIdParamsSchema }),
    (req, res, next) => {
      controller.delete(req, res).catch(next);
    },
  );

  return router;
}
