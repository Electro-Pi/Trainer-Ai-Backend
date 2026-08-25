import type { SignalContext } from './signal.types.js';

/**
 * Weight 0.30 (ARCHITECTURE §8.1). Content no longer binds to individual
 * outcomes — it belongs to a skill, and every outcome belongs to exactly one
 * skill (`Outcome.skillId`). Relevance is same-skill match: 1 if the
 * candidate's skill is the outcome's skill, 0 otherwise — should never be 0
 * in practice since the candidate pool is already fetched by `skillId`.
 */
export function outcomeRelevanceSignal(context: SignalContext): number {
  return context.contentItem.skillId === context.outcomeSkillId ? 1 : 0;
}
