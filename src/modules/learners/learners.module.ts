import { openApiRegistry } from '@/swagger/swagger.js';

import { createLearnersRouter, createTeamMembersRouter } from './learners.routes.js';
import { LearnerAssignmentRepository } from './repositories/learner-assignment.repository.js';
import { LearnerOutcomeRepository } from './repositories/learner-outcome.repository.js';
import { LearnerRepository } from './repositories/learner.repository.js';

export const learnersRouter = createLearnersRouter();
export const teamMembersRouter = createTeamMembersRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — later phases
// (P6 recommendations, P7 sessions) resolve a learner's assignment/outcome
// rows through these instead of deep-importing `modules/learners/repositories/*`.
export const learnerRepository = new LearnerRepository();
export const learnerAssignmentRepository = new LearnerAssignmentRepository();
export const learnerOutcomeRepository = new LearnerOutcomeRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/learners',
  tags: ['Learners'],
  summary: 'Lists learners (`TM-04`) — a Manager sees only their team',
  responses: { 200: { description: 'Learner list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/learners/{id}',
  tags: ['Learners'],
  summary: 'Gets a learner by id',
  responses: { 200: { description: 'Learner' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/learners/{id}',
  tags: ['Learners'],
  summary: 'Updates a learner’s job title/department/preferred language',
  responses: { 200: { description: 'Updated learner' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/learners/{id}/deactivate',
  tags: ['Learners'],
  summary: 'Deactivates a learner, retaining history (`TM-05`)',
  responses: { 200: { description: 'Deactivated learner' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/learners/{id}/experience',
  tags: ['Learners'],
  summary: 'Gets a learner’s recorded experience (`TM-03`)',
  responses: { 200: { description: 'Learner experience or null' } },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/learners/{id}/experience',
  tags: ['Learners'],
  summary:
    'Records/updates a learner’s background, years of experience and prior training (`TM-03`)',
  responses: { 200: { description: 'Saved learner experience' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/learners/{id}/assignment',
  tags: ['Learners'],
  summary:
    'Assigns a track+level, materializing the required `LearnerOutcome` set (`LV-01`…`LV-04`, `LV-06`)',
  responses: { 201: { description: 'New assignment with materialized outcomes' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/learners/{id}/outcomes',
  tags: ['Outcomes'],
  summary: 'Gets the learner’s outcome map for their active assignment (`OT-04`)',
  responses: { 200: { description: 'Learner outcome list' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/learners/{id}/outcomes',
  tags: ['Outcomes'],
  summary: 'Adds/removes/reprioritizes outcomes on the learner’s active assignment (`LV-05`)',
  responses: { 200: { description: 'Updated learner outcome list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/teams/{id}/members',
  tags: ['Teams'],
  summary: 'Lists a team’s learners',
  responses: { 200: { description: 'Learner list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/teams/{id}/members',
  tags: ['Teams'],
  summary: 'Imports learners into a team from the directory, bulk JSON (`TM-02`)',
  responses: { 201: { description: 'Import result: imported + skipped' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/teams/{id}/members/csv',
  tags: ['Teams'],
  summary: 'Imports learners into a team from a CSV payload (`TM-02`)',
  responses: { 201: { description: 'Import result: imported + skipped' } },
});
