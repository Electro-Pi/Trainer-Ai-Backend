import type { SignalContext } from './signal.types.js';

/**
 * Weight 0.15 (ARCHITECTURE §8.1). `ContentItem.difficulty` was removed from
 * the schema (content items no longer carry a difficulty rating), so this
 * signal can no longer compare a learner's expected difficulty band against
 * the candidate's difficulty. It now always returns the neutral 0.5 score —
 * the same value `RC-09`'s cold-start case used before this field existed —
 * so it contributes an equal, ranking-neutral baseline to every candidate
 * rather than being removed outright (see `SIGNAL_WEIGHTS` in
 * `signals/index.ts` for why the weight itself is left untouched).
 */
export function difficultyFitSignal(_context: SignalContext): number {
  return 0.5;
}
