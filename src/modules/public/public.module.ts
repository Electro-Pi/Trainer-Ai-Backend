import { openApiRegistry } from '@/swagger/swagger.js';

import { createPublicRouter } from './public.routes.js';
import { DemoRequestRepository } from './repositories/demo-request.repository.js';

export const publicRouter = createPublicRouter();

export const demoRequestRepository = new DemoRequestRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/public/tracks',
  tags: ['Public'],
  summary: '🌐 Public — lists the track catalogue with levels and outcomes (`WS-02`)',
  responses: { 200: { description: 'Track list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/public/tracks/{key}',
  tags: ['Public'],
  summary: '🌐 Public — a single track by its key, with levels and outcomes (`WS-02`)',
  responses: { 200: { description: 'Track' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/public/demo-requests',
  tags: ['Public'],
  summary: '🌐 Public — submits a demo request, rate-limited with a honeypot field (`WS-01`)',
  responses: { 202: { description: 'Accepted' } },
});
