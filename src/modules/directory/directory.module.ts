import { openApiRegistry } from '@/swagger/swagger.js';

import { createDirectoryRouter } from './directory.routes.js';

export const directoryRouter = createDirectoryRouter();

openApiRegistry.registerPath({
  method: 'get',
  path: '/directory/search',
  tags: ['Teams'],
  summary: 'Searches the Microsoft 365 directory by name or email (`TM-01`)',
  responses: { 200: { description: 'Matching directory users' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/directory/groups/{id}/members',
  tags: ['Teams'],
  summary: 'Lists the members of a Microsoft 365 group or Teams channel roster (`TM-06`)',
  responses: { 200: { description: 'Group members' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/directory/users',
  tags: ['Teams'],
  summary:
    'Lists the full Microsoft 365 directory with no search term, for browsing before filtering (`TM-01`)',
  responses: { 200: { description: 'Full directory user list' } },
});
