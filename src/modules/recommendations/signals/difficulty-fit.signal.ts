import { clamp01, DIFFICULTY_RANK, type SignalContext } from './signal.types.js';

/**
 * Weight 0.15 (ARCHITECTURE §8.1, `TM-03`). Maps recorded years of
 * experience to an expected difficulty band (0–2 years → EASY, 2–5 → MEDIUM,
 * 5+ → HARD) and scores by closeness — exact band match scores 1, one band
 * off scores 0.5, two bands off scores 0. `RC-09` cold start: no experience
 * recorded yet scores every difficulty at a neutral 0.5, so this signal
 * doesn't distort ranking before `TM-03` capture happens.
 */
export function difficultyFitSignal(context: SignalContext): number {
  if (context.yearsOfExperience === null) return 0.5;

  const expectedRank = context.yearsOfExperience < 2 ? 0 : context.yearsOfExperience < 5 ? 1 : 2;
  const contentRank = DIFFICULTY_RANK[context.contentItem.difficulty];
  const distance = Math.abs(expectedRank - contentRank);

  return clamp01(1 - distance / 2);
}
