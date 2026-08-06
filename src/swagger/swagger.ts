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
 * Nothing registers endpoints in P0 beyond health, so the rendered spec is
 * mostly empty except the `Health` tag — that is expected at this phase.
 */
export const openApiRegistry = new OpenAPIRegistry();

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
