import type { ContentItem } from '@/modules/content/content.module.js';

import type { ContentEffectiveness } from '../repositories/content-effectiveness.repository.js';

/** Minimal shape the signals need from a `ContentOutcome` join row — matches `ContentOutcomeRepository.findByContentItems`'s projection. */
export interface ContentOutcomeBinding {
  contentItemId: string;
  outcomeId: string;
}

/**
 * One candidate content item plus everything a signal needs to score it
 * against one required outcome — ARCHITECTURE §8.1. Each signal is a pure
 * `(context) => 0..1` function, unit-testable in isolation (P11-5) without a
 * database.
 */
export interface SignalContext {
  contentItem: ContentItem;
  /** The specific outcome this candidate is being scored against. */
  outcomeId: string;
  /** All `ContentOutcome` bindings for this candidate pool. */
  contentOutcomes: ContentOutcomeBinding[];
  /** The learner's outcome priority for `outcomeId` (`LearnerOutcome.priority`), lower is higher priority. */
  outcomePriority: number;
  /** Whether the outcome is carried over from a prior session (`OT-02`, `OT-03`) — always due for attention. */
  isCarriedOver: boolean;
  /** Learner's recorded years of experience (`TM-03`) — `null` when never captured (cold start, `RC-09`). */
  yearsOfExperience: number | null;
  /** Outcome ids the learner has a recorded weak result on, from prior question-level results (§8.1 signal 4). Empty until P8 sessions exist. */
  weakOutcomeIds: ReadonlySet<string>;
  /** Effectiveness row for this content+outcome pair, if computed yet (`RC-13`). */
  effectiveness: ContentEffectiveness | null;
  /** Cosine distance (0 = identical, 2 = opposite) to the outcome statement's embedding, if available. */
  semanticDistance: number | null;
}

export type SignalFn = (context: SignalContext) => number;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
