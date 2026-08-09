import type { SignalContext } from './signal.types.js';

/**
 * Weight 0.15 (ARCHITECTURE §8.1 signal 4, `RC` §6.7.1). Scores 1 when the
 * candidate targets an outcome the learner has a recorded weak question-level
 * result on (`context.weakOutcomeIds`, sourced from `AssessmentAnswer` once
 * P8 sessions exist), 0 otherwise. Always 0 before any session has run —
 * there is no gap to match yet, which is correct, not a placeholder.
 */
export function gapMatchSignal(context: SignalContext): number {
  return context.weakOutcomeIds.has(context.outcomeId) ? 1 : 0;
}
