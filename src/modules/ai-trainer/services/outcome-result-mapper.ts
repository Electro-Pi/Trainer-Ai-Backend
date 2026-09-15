import type { WebhookOutcomeResult } from '../dto/ai-trainer.dto.js';

export type Verdict = 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';

/** An outcome the AI marked `passed` scores full marks; anything else is 0. */
const ACHIEVED_SCORE = 100;

export interface OutcomeTitles {
  outcomeId: string;
  titleEn: string;
  titleAr: string;
}

export interface MappedOutcomeVerdict {
  outcomeId: string;
  verdict: Verdict;
  score: number;
}

export interface MapOutcomeResultsOutput {
  verdicts: MappedOutcomeVerdict[];
  /** Outcome ids we held no AI result for — caller logs these. */
  unmatchedOutcomeIds: string[];
  /** `outcome_results[]` labels that matched no outcome of ours — caller logs these. */
  unmatchedAiLabels: string[];
}

/**
 * Text-normalising join key. The AI Trainer identifies an outcome only by its
 * free-text label (`WebhookOutcomeResult.outcome`), so until that payload
 * carries our `outcomeId` this is the only join available: casefold, collapse
 * internal runs of whitespace, trim, and strip trailing punctuation so a
 * re-worded period or a double space doesn't desync a score.
 */
function normalizeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。،,;:!?]+$/u, '')
    .trim();
}

/**
 * Per-outcome verdict from the AI's own `passed` flag, replacing the flat
 * `trainee_view.overall_score` that was previously stamped onto every
 * `SessionOutcome` row (making every card in the session report read an
 * identical score/verdict regardless of how the learner actually answered).
 *
 * An outcome the AI never exercised comes back `passed: false` and so scores
 * 0/NOT_ACHIEVED rather than inheriting the session average — an outcome that
 * went undemonstrated was not achieved.
 *
 * NOTE: the session-level `overall_score` is still the AI's own number and is
 * NOT derived from these verdicts, so the two can disagree — staging holds a
 * session reporting `overall_score: 75` with zero questions asked and every
 * outcome failed. That inconsistency is the AI service's to fix; this mapper
 * only stops it from being copied onto every outcome card.
 */
export function mapOutcomeResults(
  sessionOutcomes: OutcomeTitles[],
  aiResults: WebhookOutcomeResult[],
): MapOutcomeResultsOutput {
  const resultByLabel = new Map<string, WebhookOutcomeResult>();
  for (const result of aiResults) {
    resultByLabel.set(normalizeLabel(result.outcome), result);
  }

  const matchedLabels = new Set<string>();
  const verdicts: MappedOutcomeVerdict[] = [];
  const unmatchedOutcomeIds: string[] = [];

  for (const outcome of sessionOutcomes) {
    const keys = [normalizeLabel(outcome.titleEn), normalizeLabel(outcome.titleAr)].filter(
      (k) => k.length > 0,
    );
    const matchedKey = keys.find((k) => resultByLabel.has(k));
    const result = matchedKey ? resultByLabel.get(matchedKey) : undefined;

    if (!result || !matchedKey) {
      unmatchedOutcomeIds.push(outcome.outcomeId);
      continue;
    }

    matchedLabels.add(matchedKey);
    verdicts.push({
      outcomeId: outcome.outcomeId,
      score: scoreOf(result),
      verdict: verdictOf(result),
    });
  }

  const unmatchedAiLabels = aiResults
    .map((r) => r.outcome)
    .filter((label) => !matchedLabels.has(normalizeLabel(label)));

  return { verdicts, unmatchedOutcomeIds, unmatchedAiLabels };
}

/**
 * `passed` is the single source of truth for an outcome, per the AI team:
 * their evaluation is the authority on whether an outcome was demonstrated,
 * and it is the one field they commit to sending for every outcome.
 *
 * `questions_asked`/`questions_correct` are deliberately NOT used to derive a
 * ratio here. They are still present on the payload and remain useful context,
 * but scoring off them second-guesses the AI's own judgement — a learner can
 * answer a question "incorrectly" and still demonstrate the outcome, and vice
 * versa. Treating the tally as the score made our number disagree with theirs.
 *
 * Consequence, accepted deliberately: an outcome is binary from this flow —
 * 100/ACHIEVED or 0/NOT_ACHIEVED. `PARTIALLY_ACHIEVED` is unreachable here
 * (it remains in use by the rubric-scored agent flow, which has per-criterion
 * scores to justify it). Partial credit — e.g. 1 of 2 questions right — is not
 * represented; `passed` already encodes the AI's verdict on that case.
 */
function scoreOf(result: WebhookOutcomeResult): number {
  return result.passed ? ACHIEVED_SCORE : 0;
}

function verdictOf(result: WebhookOutcomeResult): Verdict {
  return result.passed ? 'ACHIEVED' : 'NOT_ACHIEVED';
}
