import type { ScoredItem } from './scorer.service.js';

export interface DurationFitResult {
  fitted: ScoredItem[];
  deferred: ScoredItem[];
}

/**
 * `P6-5` — ARCHITECTURE §8.1 step 5, `RC-04`. Greedy fit against a session's
 * `durationMinutes`: walks the already-ordered set (prerequisite order must
 * survive — this does not re-sort by size) and takes items while they still
 * fit, so a session's content set respects both dependency order and the
 * time budget. Mandatory items (`RC-12`) are exempt from being deferred —
 * they're taken regardless of budget, since dropping one would violate
 * `isMandatory`'s force-include guarantee; the budget simply goes negative
 * rather than silently drop them.
 */
export class DurationFitService {
  fit(
    orderedItems: ScoredItem[],
    durationMinutes: number,
    mandatoryContentIds: Set<string>,
  ): DurationFitResult {
    const fitted: ScoredItem[] = [];
    const deferred: ScoredItem[] = [];
    let remaining = durationMinutes;

    for (const item of orderedItems) {
      const isMandatory = mandatoryContentIds.has(item.contentItem.id);
      const cost = item.contentItem.estimatedMinutes;

      if (isMandatory || cost <= remaining) {
        fitted.push(item);
        remaining -= cost;
      } else {
        deferred.push(item);
      }
    }

    return { fitted, deferred };
  }
}
