import { difficultyFitSignal } from './difficulty-fit.signal.js';
import { effectivenessSignal } from './effectiveness.signal.js';
import { gapMatchSignal } from './gap-match.signal.js';
import { outcomePrioritySignal } from './outcome-priority.signal.js';
import { outcomeRelevanceSignal } from './outcome-relevance.signal.js';
import { semanticSimilaritySignal } from './semantic-similarity.signal.js';
import type { SignalFn } from './signal.types.js';

export type SignalName =
  | 'outcomeRelevance'
  | 'outcomePriority'
  | 'difficultyFit'
  | 'gapMatch'
  | 'effectiveness'
  | 'semanticSimilarity';

/**
 * ARCHITECTURE §8.1's weight table — the only place the six weights are
 * defined.
 *
 * `difficultyFit` is left at 0.15 rather than redistributed, even though
 * `ContentItem.difficulty` was removed from the schema and
 * `difficultyFitSignal` now always returns a constant 0.5 (see its doc
 * comment). `ScorerService.scoreOne` combines signals additively
 * (`score += value * SIGNAL_WEIGHTS[name]`), so a constant signal value adds
 * the exact same `0.15 * 0.5 = 0.075` to every candidate's score. Adding the
 * same constant to every candidate never changes their relative order, so
 * leaving `difficultyFit` in the weight table (unlike deleting it and
 * rebalancing the rest to sum to 1.0) is mathematically a no-op on ranking —
 * and avoids risking a behavior change nobody asked for. If `difficultyFit`
 * is ever fully removed from `SIGNAL_FNS`, rebalance the remaining 5 weights
 * proportionally at that point.
 */
export const SIGNAL_WEIGHTS: Record<SignalName, number> = {
  outcomeRelevance: 0.3,
  outcomePriority: 0.2,
  difficultyFit: 0.15,
  gapMatch: 0.15,
  effectiveness: 0.1,
  semanticSimilarity: 0.1,
};

export const SIGNAL_FNS: Record<SignalName, SignalFn> = {
  outcomeRelevance: outcomeRelevanceSignal,
  outcomePriority: outcomePrioritySignal,
  difficultyFit: difficultyFitSignal,
  gapMatch: gapMatchSignal,
  effectiveness: effectivenessSignal,
  semanticSimilarity: semanticSimilaritySignal,
};

export type { SignalContext, SignalFn } from './signal.types.js';
