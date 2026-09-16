import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import {
  authorize,
  requireTeamAccess,
  requireTeamScopedList,
} from '@/common/guards/authorize.guard.js';
import { tenantScope } from '@/common/guards/tenant.guard.js';
import { validate } from '@/common/pipes/validate.js';
import { paginationSchema } from '@/common/validators/primitives.js';
import { teamRepository } from '@/modules/teams/teams.module.js';

import { LearnerAssignmentController } from './controllers/learner-assignment.controller.js';
import { LearnerController } from './controllers/learner.controller.js';
import { TeamMemberController } from './controllers/team-member.controller.js';
import { LearnerRepository } from './repositories/learner.repository.js';
import {
  assignLearnerSchema,
  importLearnersCsvSchema,
  importLearnersSchema,
  inviteLearnerSchema,
  learnerFilterSchema,
  learnerIdParamsSchema,
  learnerOutcomeFilterSchema,
  patchLearnerOutcomesSchema,
  putLearnerExperienceSchema,
  teamIdParamsSchema,
  updateLearnerSchema,
} from './validators/learner.validators.js';

const learnerController = new LearnerController();
const assignmentController = new LearnerAssignmentController();
const memberController = new TeamMemberController();
const learners = new LearnerRepository();

/**
 * Learners are learner data — a CONTENT_CREATOR has no learner visibility
 * (ARCHITECTURE §7.2), so it is deliberately absent.
 */
const READ_ROLES = ['DEPARTMENT_MANAGER', 'ADMIN'] as const;

/** Authorization scope for the `GET /learners` collection — the teams this manager actually manages. */
async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const teams = await teamRepository.findByManager(managerId);
  return teams.map((team) => team.id);
}

async function resolveManagerIdByTeam(req: { params: { id?: string } }): Promise<string | null> {
  const teamId = req.params.id;
  if (!teamId) return null;
  const team = await teamRepository.findByIdScoped(teamId);
  return team?.managerId ?? null;
}

async function resolveManagerIdByLearner(req: { params: { id?: string } }): Promise<string | null> {
  const learnerId = req.params.id;
  if (!learnerId) return null;
  const learner = await learners.findByIdScoped(learnerId);
  if (!learner) return null;
  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

/** §7.2: a DEPARTMENT_MANAGER reaches only learners on a team they manage; ADMIN reaches all. */
export function createLearnersRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  // `authorize` alone gated the role but not ownership: the `teamId` query
  // param is a client-chosen FILTER, so omitting it returned every learner in
  // the organization — including foreign departments' emails, job titles and
  // `entraObjectId`s — to any DEPARTMENT_MANAGER. The `/:id` routes below were
  // already covered by `requireTeamAccess`, which cannot apply to a list (no
  // single id to resolve); `requireTeamScopedList` is its collection
  // counterpart and fails closed via `listScopeFilter` in the controller.
  router.get(
    '/',
    validate({ query: learnerFilterSchema }),
    requireTeamScopedList(resolveManagedTeamIds, READ_ROLES),
    (req, res, next) => {
      learnerController.list(req, res).catch(next);
    },
  );

  router.get(
    '/:id',
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.getById(req, res).catch(next);
    },
  );

  router.patch(
    '/:id',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema, body: updateLearnerSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.update(req, res).catch(next);
    },
  );

  // `POST /:id/deactivate` is NOT mounted here. Deactivating a learner has to
  // cancel their active plans and Teams meetings first, which needs
  // `training-plans`/`sessions` — importing either from this module would
  // close a cycle through `sessions.module.ts` and race the two modules'
  // top-level singleton init. The route lives in
  // `training-plans.routes.ts`'s `createLearnerDeactivationRouter`, mounted
  // on `/learners` alongside this router, exactly as the active-plan route is.

  // Reactivation restores membership only, so it does not need the
  // cross-module training cascade owned by the deactivate route.
  router.post(
    '/:id/reactivate',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.reactivate(req, res).catch(next);
    },
  );

  // Permanent, unlike `/deactivate` above — see `LearnerService.remove`.
  // `requireTeamAccess` keeps a DEPARTMENT_MANAGER to their own team's
  // learners; an ADMIN passes it for any learner in the org.
  router.delete(
    '/:id',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.remove(req, res).catch(next);
    },
  );

  router.get(
    '/:id/experience',
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.getExperience(req, res).catch(next);
    },
  );

  router.put(
    '/:id/experience',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema, body: putLearnerExperienceSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.putExperience(req, res).catch(next);
    },
  );

  router.post(
    '/:id/assignment',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema, body: assignLearnerSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      assignmentController.assign(req, res).catch(next);
    },
  );

  router.get(
    '/:id/outcomes',
    validate({ params: learnerIdParamsSchema, query: learnerOutcomeFilterSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      assignmentController.getOutcomeMap(req, res).catch(next);
    },
  );

  router.patch(
    '/:id/outcomes',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema, body: patchLearnerOutcomesSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      assignmentController.patchOutcomes(req, res).catch(next);
    },
  );

  return router;
}

/** `TM-02` — `/teams/:id/members`, mounted separately in `app.ts` alongside `teamsRouter`. */
export function createTeamMembersRouter(): Router {
  const router = Router();

  router.use(authenticate(), tenantScope());

  router.get(
    '/:id/members',
    validate({ params: teamIdParamsSchema, query: paginationSchema }),
    requireTeamAccess(resolveManagerIdByTeam),
    (req, res, next) => {
      memberController.listMembers(req, res).catch(next);
    },
  );

  router.post(
    '/:id/members',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: teamIdParamsSchema, body: importLearnersSchema }),
    requireTeamAccess(resolveManagerIdByTeam),
    (req, res, next) => {
      memberController.importMembers(req, res).catch(next);
    },
  );

  router.post(
    '/:id/members/csv',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: teamIdParamsSchema, body: importLearnersCsvSchema }),
    requireTeamAccess(resolveManagerIdByTeam),
    (req, res, next) => {
      memberController.importMembersCsv(req, res).catch(next);
    },
  );

  router.post(
    '/:id/members/invite',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: teamIdParamsSchema, body: inviteLearnerSchema }),
    requireTeamAccess(resolveManagerIdByTeam),
    (req, res, next) => {
      memberController.inviteMember(req, res).catch(next);
    },
  );

  return router;
}
