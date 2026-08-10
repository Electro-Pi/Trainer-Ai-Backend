import { openApiRegistry } from '@/swagger/swagger.js';

import { TrackRepository } from './repositories/track.repository.js';
import { createTracksRouter } from './tracks.routes.js';

export type { Track } from './repositories/track.repository.js';

export const tracksRouter = createTracksRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `learners`
// resolves a level assignment's `trackId` (`LV-01`) through this instead of
// deep-importing `modules/tracks/repositories/*`.
export const trackRepository = new TrackRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/tracks',
  tags: ['Tracks'],
  summary: 'Lists tracks (`TC-01`)',
  responses: { 200: { description: 'Track list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/tracks',
  tags: ['Tracks'],
  summary: 'Creates a track (MANAGER, CONTENT_MANAGER, ADMIN)',
  responses: { 201: { description: 'Created track' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/tracks/{id}',
  tags: ['Tracks'],
  summary: 'Gets a track by id',
  responses: { 200: { description: 'Track' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/tracks/{id}',
  tags: ['Tracks'],
  summary: 'Updates a track’s fields',
  responses: { 200: { description: 'Updated track' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/tracks/{id}/enabled',
  tags: ['Tracks'],
  summary: 'Enables/disables a track without deleting it or its history (`TC-06`)',
  responses: { 200: { description: 'Updated track' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/tracks/{id}/duplicate',
  tags: ['Tracks'],
  summary: 'Deep-copies a track with its levels and outcomes (`TC-07`)',
  responses: { 201: { description: 'New (disabled) track copy' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/tracks/reorder',
  tags: ['Tracks'],
  summary: 'Reorders tracks transactionally',
  responses: { 200: { description: 'New order' } },
});
