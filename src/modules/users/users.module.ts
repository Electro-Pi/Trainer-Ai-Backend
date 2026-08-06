import { openApiRegistry } from '@/swagger/swagger.js';

import { PortalUserRepository } from './repositories/portal-user.repository.js';
import { RefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { createUsersRouter } from './users.routes.js';

export const usersRouter = createUsersRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `auth`
// upserts `PortalUser`/`RefreshToken` rows through these instead of
// deep-importing `modules/users/repositories/*`.
export const portalUserRepository = new PortalUserRepository();
export const refreshTokenRepository = new RefreshTokenRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/users',
  tags: ['Users'],
  summary: 'Lists portal users in the caller’s organization (ADMIN only)',
  responses: { 200: { description: 'Portal user list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/users',
  tags: ['Users'],
  summary: 'Creates a portal user (ADMIN only)',
  responses: { 201: { description: 'Created portal user' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/users/{id}',
  tags: ['Users'],
  summary: 'Updates a portal user’s role/locale/active state (ADMIN only)',
  responses: { 200: { description: 'Updated portal user' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/users/{id}/deactivate',
  tags: ['Users'],
  summary: 'Deactivates a portal user without deleting their history (ADMIN only)',
  responses: { 200: { description: 'Deactivated portal user' } },
});
