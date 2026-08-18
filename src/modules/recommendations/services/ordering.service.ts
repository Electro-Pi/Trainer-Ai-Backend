import { logger } from '@/logger/logger.service.js';
import type { ContentPrerequisite } from '@/modules/content/content.module.js';

import type { ScoredItem } from './scorer.service.js';

/**
 * `P6-4` — ARCHITECTURE §8.1 step 4, `RC-02`. Topological sort over
 * `ContentPrerequisite.prerequisiteContentId` edges restricted to content
 * items present in this ranked set — a prerequisite pointing outside the set
 * (already achieved, or in a different pool) doesn't constrain order here.
 * A cycle is impossible to satisfy honestly, so it logs a warning and falls
 * back to score order rather than silently dropping items or throwing and
 * blocking the whole recommendation. (Previously fell back to difficulty
 * order first; `ContentItem.difficulty` no longer exists, so this is now a
 * pure score sort.)
 */
export class OrderingService {
  order(items: ScoredItem[], prerequisites: ContentPrerequisite[]): ScoredItem[] {
    const itemIds = new Set(items.map((item) => item.contentItem.id));
    const edges = new Map<string, Set<string>>(); // contentId -> set of prerequisite contentIds within this set
    for (const id of itemIds) edges.set(id, new Set());

    for (const prereq of prerequisites) {
      if (!prereq.prerequisiteContentId) continue;
      if (!itemIds.has(prereq.contentItemId) || !itemIds.has(prereq.prerequisiteContentId))
        continue;
      edges.get(prereq.contentItemId)?.add(prereq.prerequisiteContentId);
    }

    const sorted = this.topologicalSort(itemIds, edges);
    if (!sorted) {
      logger.warn(
        { contentItemIds: [...itemIds] },
        'Prerequisite cycle detected in recommendation set — falling back to score order (RC-02)',
      );
      return this.byScore(items);
    }

    const positionById = new Map(sorted.map((id, index) => [id, index]));
    return [...items].sort(
      (a, b) =>
        (positionById.get(a.contentItem.id) ?? 0) - (positionById.get(b.contentItem.id) ?? 0),
    );
  }

  /** Kahn's algorithm — stable within each in-degree-0 batch by insertion order. Returns `null` on a cycle. */
  private topologicalSort(itemIds: Set<string>, edges: Map<string, Set<string>>): string[] | null {
    const inDegree = new Map<string, number>();
    for (const id of itemIds) inDegree.set(id, edges.get(id)?.size ?? 0);

    const dependents = new Map<string, string[]>();
    for (const id of itemIds) dependents.set(id, []);
    for (const [contentId, prereqIds] of edges) {
      for (const prereqId of prereqIds) {
        dependents.get(prereqId)?.push(contentId);
      }
    }

    const queue = [...itemIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
    const result: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      result.push(id);

      for (const dependent of dependents.get(id) ?? []) {
        const remaining = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, remaining);
        if (remaining === 0) queue.push(dependent);
      }
    }

    return result.length === itemIds.size ? result : null;
  }

  private byScore(items: ScoredItem[]): ScoredItem[] {
    return [...items].sort((a, b) => b.score - a.score);
  }
}
