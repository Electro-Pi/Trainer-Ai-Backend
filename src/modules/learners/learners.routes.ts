import { Router } from 'express';

import { authenticate } from '@/common/guards/authenticate.guard.js';
import { authorize, requireTeamAccess } from '@/common/guards/authorize.guard.js';
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

  router.get(
    '/',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ query: learnerFilterSchema }),
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

  router.post(
    '/:id/deactivate',
    authorize('DEPARTMENT_MANAGER', 'ADMIN'),
    validate({ params: learnerIdParamsSchema }),
    requireTeamAccess(resolveManagerIdByLearner),
    (req, res, next) => {
      learnerController.deactivate(req, res).catch(next);
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
