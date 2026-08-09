export interface CriterionScoreInput {
  criterionId: string;
  score: number;
  maxScore: number;
}

export interface RubricCriterionInput {
  id: string;
  weight: number;
}

const PARTIAL_ACHIEVEMENT_RATIO = 0.6;

/**
 * `LS-06`, `LS-08`, D-03 — pure, zero-I/O so it's unit-testable in isolation
 * (P11-5's pattern for the recommendation signals applies here too). The AI
 * service sends per-criterion judgements (§9.11); this is the one place that
 * turns them into a weighted total and a verdict — never their side, so a
 * model change on their end can't silently rewrite recorded competency.
 */
export class VerdictService {
  /** Weighted average of criterion score ratios (0-100), one answer's worth of criteria at a time, then averaged across however many answers touched each criterion. */
  computeWeightedScore(answers: CriterionScoreInput[][], criteria: RubricCriterionInput[]): number {
    if (criteria.length === 0) return 0;

    const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
    let weightedSum = 0;

    for (const criterion of criteria) {
      const scoresForCriterion = answers
        .flat()
        .filter((s) => s.criterionId === criterion.id && s.maxScore > 0);

      if (scoresForCriterion.length === 0) continue;

      const avgRatio =
        scoresForCriterion.reduce((sum, s) => sum + s.score / s.maxScore, 0) /
        scoresForCriterion.length;

      weightedSum += avgRatio * criterion.weight;
    }

    return Math.round((weightedSum / totalWeight) * 100);
  }

  deriveVerdict(
    totalScore: number,
    passThreshold: number,
  ): 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' {
    if (totalScore >= passThreshold) return 'ACHIEVED';
    if (totalScore >= passThreshold * PARTIAL_ACHIEVEMENT_RATIO) return 'PARTIALLY_ACHIEVED';
    return 'NOT_ACHIEVED';
  }
}
