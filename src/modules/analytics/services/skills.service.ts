import { NotFoundError } from '@/common/exceptions/app-error.js';
import { learnerOutcomeRepository, learnerRepository } from '@/modules/learners/learners.module.js';

import type { LearnerSkillsResponseDto, SkillCoverageRow } from '../dto/analytics.dto.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';

/**
 * `PF-04` — per-learner skills view derived from `Outcome.targetSkills`
 * (BRD §6.5's skill tags) crossed with the learner's own `LearnerOutcome`
 * status. `PF-05` (drill-down to session reports) is satisfied by
 * `recentSessions[].sessionId` — the frontend links straight into the
 * existing `GET /reports?sessionId=` (P9), no new endpoint needed.
 */
export class SkillsService {
  async learnerSkills(learnerId: string): Promise<LearnerSkillsResponseDto> {
    const learner = await learnerRepository.findByIdScoped(learnerId);
    if (!learner) throw new NotFoundError('Learner not found');

    const [learnerOutcomes, sessions] = await Promise.all([
      learnerOutcomeRepository.findByLearner(learnerId),
      analyticsRepository.sessionsForLearners([learnerId]),
    ]);

    const outcomes = await analyticsRepository.outcomesWithSkillTags(
      learnerOutcomes.map((lo) => lo.outcomeId),
    );
    const statusByOutcome = new Map(learnerOutcomes.map((lo) => [lo.outcomeId, lo.status]));

    const bySkill = new Map<string, { total: number; achieved: number }>();
    for (const outcome of outcomes) {
      const status = statusByOutcome.get(outcome.id);
      for (const skill of outcome.targetSkills) {
        const bucket = bySkill.get(skill) ?? { total: 0, achieved: 0 };
        bucket.total += 1;
        if (status === 'ACHIEVED') bucket.achieved += 1;
        bySkill.set(skill, bucket);
      }
    }

    const skills: SkillCoverageRow[] = [...bySkill.entries()]
      .map(([skill, { total, achieved }]) => ({
        skill,
        outcomesTotal: total,
        outcomesAchieved: achieved,
        coverageRate: total === 0 ? 0 : achieved / total,
      }))
      .sort((a, b) => a.skill.localeCompare(b.skill));

    const recentSessions = sessions
      .slice()
      .sort((a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime())
      .slice(0, 10)
      .map((session) => ({
        sessionId: session.id,
        scheduledStart: session.scheduledStart.toISOString(),
        verdict: session.verdict as 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null,
        score: session.score,
      }));

    return {
      learnerId,
      displayName: learner.displayName,
      skills,
      recentSessions,
    };
  }
}

export const skillsService = new SkillsService();
