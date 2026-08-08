import { openApiRegistry } from '@/swagger/swagger.js';

import { createLevelOutcomesRouter, createOutcomesRouter } from './outcomes.routes.js';
import { OutcomeRepository } from './repositories/outcome.repository.js';

export const levelOutcomesRouter = createLevelOutcomesRouter();
export const outcomesRouter = createOutcomesRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `learners`
// materializes `LearnerOutcome` rows for a level's outcome set (`LV-03`,
// `LV-04`) through this instead of deep-importing
// `modules/outcomes/repositories/*`.
export const outcomeRepository = new OutcomeRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/levels/{levelId}/outcomes',
  tags: ['Outcomes'],
  summary: 'Lists a level’s outcomes, ordered (`TC-03`, `LV-03`)',
  responses: { 200: { description: 'Outcome list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/levels/{levelId}/outcomes',
  tags: ['Outcomes'],
  summary: 'Creates an outcome on a level',
  responses: { 201: { description: 'Created outcome' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/levels/{levelId}/outcomes/reorder',
  tags: ['Outcomes'],
  summary: 'Reorders a level’s outcomes transactionally',
  responses: { 200: { description: 'New order' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/outcomes/{id}',
  tags: ['Outcomes'],
  summary: 'Gets an outcome by id',
  responses: { 200: { description: 'Outcome' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/outcomes/{id}',
  tags: ['Outcomes'],
  summary: 'Updates an outcome’s fields',
  responses: { 200: { description: 'Updated outcome' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/outcomes/{id}/enabled',
  tags: ['Outcomes'],
  summary: 'Enables/disables an outcome without deleting it or learner history',
  responses: { 200: { description: 'Updated outcome' } },
});
