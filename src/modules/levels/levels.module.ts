import { openApiRegistry } from '@/swagger/swagger.js';

import { createLevelsRouter, createTrackLevelsRouter } from './levels.routes.js';
import { LevelRepository } from './repositories/level.repository.js';

export const trackLevelsRouter = createTrackLevelsRouter();
export const levelsRouter = createLevelsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `learners`
// resolves a level assignment's `levelId` (`LV-01`, `LV-02`) through this
// instead of deep-importing `modules/levels/repositories/*`.
export const levelRepository = new LevelRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/tracks/{trackId}/levels',
  tags: ['Levels'],
  summary: 'Lists a track’s levels, ordered (`TC-02`)',
  responses: { 200: { description: 'Level list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/tracks/{trackId}/levels',
  tags: ['Levels'],
  summary: 'Creates a level on a track',
  responses: { 201: { description: 'Created level' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/levels/{id}/enabled',
  tags: ['Levels'],
  summary: 'Enables/disables a level without deleting it or its outcomes',
  responses: { 200: { description: 'Updated level' } },
});
