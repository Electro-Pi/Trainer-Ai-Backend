import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';

import { SWAGGER_TAGS } from './tags.js';

extendZodWithOpenApi(z);

/**
 * Single shared registry — every module's `<name>.module.ts` imports this
 * and calls `.registerPath(...)` under its own tag as it comes online.
 */
export const openApiRegistry = new OpenAPIRegistry();

// Health checks live outside `/api/v1` (unversioned liveness/readiness
// probes) and have no dedicated module, so they register here instead of a
// `<name>.module.ts`. The document's `servers` entry is `/api/v1`, which
// these routes deliberately sit outside — the summary calls that out since
// zod-to-openapi has no per-operation server override to fix "Try it out".
openApiRegistry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary:
    'Liveness check — process is up. Actual path is unversioned: GET /health (not under /api/v1).',
  responses: { 200: { description: 'OK' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary:
    'Readiness check — database, Redis and storage all reachable. Actual path is unversioned: GET /health/ready (not under /api/v1).',
  responses: {
    200: { description: 'Ready' },
    503: { description: 'Not ready — one or more dependency checks failed' },
  },
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(openApiRegistry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'MODRB (AI Trainer) API',
      version: '1.0.0',
      description:
        'AI-powered training platform API — scheduling, recommendations and reporting over a Microsoft 365 directory.',
    },
    servers: [{ url: '/api/v1' }],
    tags: SWAGGER_TAGS,
  });
}

export function mountSwagger(app: Express, path = '/api/docs'): void {
  app.use(path, swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument()));
}
