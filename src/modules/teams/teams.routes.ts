import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';

import { TeamController } from './controllers/team.controller.js';
import { TeamRepository } from './repositories/team.repository.js';
import {
  createTeamSchema,
  teamFilterSchema,
  teamIdParamsSchema,
  updateTeamSchema,
} from './validators/team.validators.js';

const controller = new TeamController();
const teams = new TeamRepository();

async function resolveManagerId(req: { params: { id?: string } }): Promise<string | null> {
  const id = req.params.id;
  if (!id) return null;
  const team = await teams.findByIdScoped(id);
  return team?.managerId ?? null;
}

/** §7.2: MANAGER reaches only their own team; HR reads org-wide; CONTENT_MANAGER has no row here. */
export function createTeamsRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get(
    '/',
    authorize('MANAGER', 'HR', 'ADMIN'),
    validate({ query: teamFilterSchema }),
    (req, res, next) => {
      controller.list(req, res).catch(next);
    },
  );

  router.get(
    '/:id',
    validate({ params: teamIdParamsSchema }),
    requireTeamAccess(resolveManagerId),
    (req, res, next) => {
      controller.getById(req, res).catch(next);
    },
  );

  router.post(
    '/',
    authorize('MANAGER', 'ADMIN'),
    validate({ body: createTeamSchema }),
    (req, res, next) => {
      controller.create(req, res).catch(next);
    },
  );

  router.patch(
    '/:id',
    authorize('MANAGER', 'ADMIN'),
    validate({ params: teamIdParamsSchema, body: updateTeamSchema }),
    requireTeamAccess(resolveManagerId),
    (req, res, next) => {
      controller.update(req, res).catch(next);
    },
  );

  return router;
}
