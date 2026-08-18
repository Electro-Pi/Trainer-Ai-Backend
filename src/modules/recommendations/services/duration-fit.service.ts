import type { ScoredItem } from './scorer.service.js';

export interface DurationFitResult {
  fitted: ScoredItem[];
  deferred: ScoredItem[];
}

/**
 * Content items no longer carry a real duration estimate
 * (`ContentItem.estimatedMinutes` was removed from the schema). Every item
 * is assumed to cost this many minutes for bin-packing purposes — matches
 * the track-creation wizard's old default `estimatedMinutes` value, so
 * behavior for existing content stays roughly the same on average.
 */
const ASSUMED_CONTENT_MINUTES = 15;

/**
 * `P6-5` — ARCHITECTURE §8.1 step 5, `RC-04`. Greedy fit against a session's
 * `durationMinutes`: walks the already-ordered set (prerequisite order must
 * survive — this does not re-sort by size) and takes items while they still
 * fit, so a session's content set respects both dependency order and the
 * time budget. `ContentItem.isMandatory` was removed from the schema, so
 * there is no more force-include override — every item is subject to the
 * same budget check.
 */
export class DurationFitService {
  fit(orderedItems: ScoredItem[], durationMinutes: number): DurationFitResult {
    const fitted: ScoredItem[] = [];
    const deferred: ScoredItem[] = [];
    let remaining = durationMinutes;

    for (const item of orderedItems) {
      const cost = ASSUMED_CONTENT_MINUTES;

      if (cost <= remaining) {
        fitted.push(item);
        remaining -= cost;
      } else {
        deferred.push(item);
      }
    }

    return { fitted, deferred };
  }
}
