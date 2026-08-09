import { openApiRegistry } from '@/swagger/swagger.js';

import { createContentRouter, createMediaRouter } from './content.routes.js';
import { ContentItemRepository } from './repositories/content-item.repository.js';
import { ContentOutcomeRepository } from './repositories/content-outcome.repository.js';
import { ContentPrerequisiteRepository } from './repositories/content-prerequisite.repository.js';

export type { ContentItem, ContentType } from './repositories/content-item.repository.js';
export type { ContentPrerequisite } from './repositories/content-prerequisite.repository.js';

export const contentRouter = createContentRouter();
export const mediaRouter = createMediaRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `recommendations`
// (P6) resolves the candidate pool, outcome bindings and prerequisite edges
// through these instead of deep-importing `modules/content/repositories/*`.
export const contentItemRepository = new ContentItemRepository();
export const contentOutcomeRepository = new ContentOutcomeRepository();
export const contentPrerequisiteRepository = new ContentPrerequisiteRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/content',
  tags: ['Content'],
  summary: 'Lists content items, filterable by track/level/status/type/language',
  responses: { 200: { description: 'Content list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content',
  tags: ['Content'],
  summary: 'Creates a content item — binds to 1 track + 1 level + ≥1 outcome (`CM-01`)',
  responses: { 201: { description: 'Created content item' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/bulk',
  tags: ['Content'],
  summary: 'Batch-creates content items with shared tags merged into each (`CM-08`)',
  responses: { 201: { description: 'Created content items' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/content/bulk-metadata',
  tags: ['Content'],
  summary: 'Edits shared metadata across many content items in one call (`CM-16`)',
  responses: { 200: { description: 'Updated content items' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/content/coverage',
  tags: ['Content'],
  summary: 'Lists enabled outcomes with zero published content (`CM-13`)',
  responses: { 200: { description: 'Coverage gap list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/content/search',
  tags: ['Content'],
  summary: 'Hybrid Postgres FTS (arabic/english) + pgvector semantic search',
  responses: { 200: { description: 'Ranked search results' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/content/{id}',
  tags: ['Content'],
  summary: 'Gets a content item by id',
  responses: { 200: { description: 'Content item' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/content/{id}',
  tags: ['Content'],
  summary: 'Updates a content item’s fields',
  responses: { 200: { description: 'Updated content item' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/{id}/submit-review',
  tags: ['Content'],
  summary: 'Moves a content item from DRAFT to IN_REVIEW',
  responses: { 200: { description: 'Content item in review' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/{id}/publish',
  tags: ['Content'],
  summary: 'Publishes a content item — blocked unless all media is scan-CLEAN (`CM-07`, `CM-12`)',
  responses: { 200: { description: 'Published content item' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/{id}/archive',
  tags: ['Content'],
  summary: 'Archives a content item without deleting it (`CM-17`)',
  responses: { 200: { description: 'Archived content item' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/{id}/new-version',
  tags: ['Content'],
  summary:
    'Clones a content item into a new DRAFT version without touching in-progress plans (`CM-14`)',
  responses: { 201: { description: 'New draft version' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/content/{id}/media',
  tags: ['Content'],
  summary: 'Lists a content item’s media assets',
  responses: { 200: { description: 'Media asset list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content/{id}/media',
  tags: ['Content'],
  summary: 'Uploads a media asset — magic-byte MIME sniff, size cap, checksum (`CM-04`)',
  responses: { 201: { description: 'Created media asset, scan pending' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/media/{id}',
  tags: ['Content'],
  summary: 'Deletes a media asset from storage and its record',
  responses: { 204: { description: 'Deleted' } },
});
