import { openApiRegistry } from '@/swagger/swagger.js';

import { createOrganizationsRouter } from './organizations.routes.js';
import { OrganizationRepository } from './repositories/organization.repository.js';

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — auth's tenant
// upsert (`AU-01`) resolves organizations through this instead of deep-importing
// `modules/organizations/repositories/*`.
export const organizationRepository = new OrganizationRepository();

export const organizationsRouter = createOrganizationsRouter();

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations/me',
  tags: ['Organizations'],
  summary: "Gets the caller's own organization profile (name, default language)",
  responses: { 200: { description: 'Organization profile' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/organizations/me',
  tags: ['Organizations'],
  summary: "Updates the organization's name and/or default language (MANAGER, ADMIN)",
  responses: { 200: { description: 'Updated organization profile' } },
});
