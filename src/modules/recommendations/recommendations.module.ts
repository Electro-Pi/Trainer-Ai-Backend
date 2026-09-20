import { openApiRegistry } from '@/swagger/swagger.js';

import {
  createLearnerRecommendationsRouter,
  createRecommendationsRouter,
} from './recommendations.routes.js';
import { RecommendationItemRepository } from './repositories/recommendation-item.repository.js';
import { RecommendationRepository } from './repositories/recommendation.repository.js';
import { DurationFitService } from './services/duration-fit.service.js';
import {
  registerRecommendationEventHandlers,
  RecommendationService,
} from './services/recommendation.service.js';

export type { RecommendationItemResult } from './dto/recommendation.dto.js';
export type { ScoredItem } from './services/scorer.service.js';
export { DurationFitService };

export const learnerRecommendationsRouter = createLearnerRecommendationsRouter();
export const recommendationsRouter = createRecommendationsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — P7 (plans)
// and P8 (session completion → `SESSION_ENDED` recommendation) resolve
// recommendation rows through these instead of deep-importing
// `modules/recommendations/repositories/*`.
export const recommendationRepository = new RecommendationRepository();
export const recommendationItemRepository = new RecommendationItemRepository();
export { RecommendationService };

// `RC-01` — subscribes the `LEVEL_ASSIGNED` trigger at module load, the same
// way every other module wires its own side effects on import. This module
// must be imported (for its routers) before `app.ts` mounts `/learners`, so
// the subscription is guaranteed registered before any request can publish
// `learner.level.assigned`.
registerRecommendationEventHandlers(new RecommendationService());

openApiRegistry.registerPath({
  method: 'post',
  path: '/learners/{id}/recommendations',
  tags: ['Recommendations'],
  summary:
    'Generates a fresh MANUAL recommendation for a learner, proposed only (`RC-16`, `RC-06`)',
  responses: { 201: { description: 'Generated recommendation with items and coverage gaps' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/recommendations/{id}',
  tags: ['Recommendations'],
  summary: 'Gets a recommendation with its items, reasons and coverage gaps',
  responses: { 200: { description: 'Recommendation' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/recommendations/{id}/confirm',
  tags: ['Recommendations'],
  summary: 'Confirms a PROPOSED recommendation — the only way it becomes actionable (`RC-06`)',
  responses: { 200: { description: 'Confirmed recommendation' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/recommendations/{id}/items/{itemId}',
  tags: ['Recommendations'],
  summary: 'Accepts, rejects, reorders or replaces one recommendation item (`RC-06`, `RC-15`)',
  responses: { 200: { description: 'Updated recommendation item' } },
});
