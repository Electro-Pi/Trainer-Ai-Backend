import { openApiRegistry } from '@/swagger/swagger.js';

import { createInvitesRouter } from './invites.routes.js';
import { PortalInviteRepository } from './repositories/portal-invite.repository.js';

export const invitesRouter = createInvitesRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `auth`
// resolves a pending invite by token through this instead of deep-importing
// `modules/invites/repositories/*`.
export const portalInviteRepository = new PortalInviteRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/invites',
  tags: ['Users'],
  summary: 'Lists onboarding invites in the caller’s organization (ADMIN only)',
  responses: { 200: { description: 'Invite list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/invites',
  tags: ['Users'],
  summary: 'Invites a MANAGER or CONTENT_MANAGER by email (ADMIN only)',
  responses: { 201: { description: 'Created invite' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/invites/{id}/revoke',
  tags: ['Users'],
  summary: 'Revokes a pending invite (ADMIN only)',
  responses: { 200: { description: 'Revoked invite' } },
});
