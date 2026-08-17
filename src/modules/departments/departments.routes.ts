import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { DepartmentController } from './controllers/department.controller.js';
import {
  createDepartmentSchema,
  departmentFilterSchema,
  departmentIdParamsSchema,
  updateDepartmentSchema,
} from './validators/department.validators.js';

const controller = new DepartmentController();

/**
 * `WS-02` — any signed-in portal role reads the department list (a
 * DEPARTMENT_MANAGER must pick one when creating a team; a CONTENT_CREATOR
 * may need one for track assignment); only ADMIN creates/renames/enables/
 * disables them, same read-broad/write-narrow split `tracks`/`skills` use.
 */
export function createDepartmentsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get('/', validate({ query: departmentFilterSchema }), (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.get('/:id', validate({ params: departmentIdParamsSchema }), (req, res, next) => {
    controller.getById(req, res).catch(next);
  });

  router.post(
    '/',
    authorize('ADMIN'),
    validate({ body: createDepartmentSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.patch(
    '/:id',
    authorize('ADMIN'),
    validate({ params: departmentIdParamsSchema, body: updateDepartmentSchema }),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  return router;
}
