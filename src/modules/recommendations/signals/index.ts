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

/** ARCHITECTURE §8.1's weight table — the only place the six weights are defined. */
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
