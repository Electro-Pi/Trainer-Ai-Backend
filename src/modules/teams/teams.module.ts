import { openApiRegistry } from '@/swagger/swagger.js';

import { TeamRepository } from './repositories/team.repository.js';
import { createTeamsRouter } from './teams.routes.js';

export const teamsRouter = createTeamsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `learners`
// resolves a learner's manager through this instead of deep-importing
// `modules/teams/repositories/*`.
export const teamRepository = new TeamRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/teams',
  tags: ['Teams'],
  summary: 'Lists teams — a Department Manager sees only their own, ADMIN sees all',
  responses: { 200: { description: 'Team list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/teams',
  tags: ['Teams'],
  summary: 'Creates a team (DEPARTMENT_MANAGER, ADMIN)',
  responses: { 201: { description: 'Created team' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/teams/{id}',
  tags: ['Teams'],
  summary: 'Gets a team by id',
  responses: { 200: { description: 'Team' }, 403: { description: 'Not your team' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/teams/{id}',
  tags: ['Teams'],
  summary: 'Updates a team’s name/description/manager',
  responses: { 200: { description: 'Updated team' } },
});

// `/teams/{id}/members*` routes are registered by `learners.module.ts`
// (`teamMembersRouter`) — the URL is team-owned, the logic is learners-owned.
