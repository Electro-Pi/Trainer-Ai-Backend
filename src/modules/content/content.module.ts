import { openApiRegistry } from '@/swagger/swagger.js';

import { createContentRouter, createMediaRouter } from './content.routes.js';
import { ContentItemRepository } from './repositories/content-item.repository.js';
import { ContentPrerequisiteRepository } from './repositories/content-prerequisite.repository.js';
import { MediaAssetRepository } from './repositories/media-asset.repository.js';
import { MediaService } from './services/media.service.js';

export type { ContentItem } from './repositories/content-item.repository.js';
export type { ContentPrerequisite } from './repositories/content-prerequisite.repository.js';
export type { MediaAsset } from './repositories/media-asset.repository.js';

export const contentRouter = createContentRouter();
export const mediaRouter = createMediaRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `recommendations`
// (P6) resolves the candidate pool and prerequisite edges, and `agent` (P8)
// resolves media SAS URLs for session context, through these instead of
// deep-importing `modules/content/repositories/*`.
export const contentItemRepository = new ContentItemRepository();
export const contentPrerequisiteRepository = new ContentPrerequisiteRepository();
export const mediaAssetRepository = new MediaAssetRepository();
export const mediaService = new MediaService();

openApiRegistry.registerPath({
  method: 'get',
  path: '/content',
  tags: ['Content'],
  summary: 'Lists content items, filterable by skill',
  responses: { 200: { description: 'Content list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/content',
  tags: ['Content'],
  summary: 'Creates a content item — binds to exactly 1 skill',
  responses: { 201: { description: 'Created content item' } },
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
  summary: 'Updates a content item’s name',
  responses: { 200: { description: 'Updated content item' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/content/{id}',
  tags: ['Content'],
  summary: 'Deletes a content item and its media',
  responses: { 204: { description: 'Deleted' } },
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
