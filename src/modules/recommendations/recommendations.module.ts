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
