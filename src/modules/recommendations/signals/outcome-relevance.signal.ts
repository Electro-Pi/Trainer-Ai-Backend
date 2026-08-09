import type { SignalContext } from './signal.types.js';

/**
 * Weight 0.30 (ARCHITECTURE §8.1). `ContentOutcome` is a plain join with no
 * direct/secondary column of its own, so relevance is read from how many
 * outcomes a candidate is bound to: content written for exactly this one
 * outcome is maximally relevant (1); content that also covers other outcomes
 * dilutes its focus on this one (0.6). Not bound at all scores 0 — should
 * never occur since the candidate pool already requires ≥1 matching bind.
 */
export function outcomeRelevanceSignal(context: SignalContext): number {
  const bound = context.contentOutcomes.filter((co) => co.contentItemId === context.contentItem.id);
  const isBoundToThisOutcome = bound.some((co) => co.outcomeId === context.outcomeId);
  if (!isBoundToThisOutcome) return 0;

  return bound.length === 1 ? 1 : 0.6;
}
