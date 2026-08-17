import { NotFoundError } from '@/common/exceptions/app-error.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';

import type {
  LearnerPerformanceRow,
  OrganizationPerformanceResponseDto,
  TeamPerformanceResponseDto,
} from '../dto/analytics.dto.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function statusFor(
  sessionsAttended: number,
  averageScore: number | null,
): LearnerPerformanceRow['status'] {
  if (sessionsAttended === 0) return 'NO_ACTIVITY';
  if (averageScore !== null && averageScore < 60) return 'AT_RISK';
  return 'ON_TRACK';
}

/**
 * `PF-01`…`PF-05` — team and org performance rollups. Every read here goes
 * through `analyticsRepository`, which resolves the tenant-safe `learnerId`
 * set first (§7.3 — `LearnerOutcome`/`Session` participate transitively, not
 * directly, in tenant scoping) before touching any non-tenant-scoped model.
 */
export class PerformanceService {
  private async learnerRows(learnerIds: string[]): Promise<LearnerPerformanceRow[]> {
    if (learnerIds.length === 0) return [];

    const [learners, sessions, assignments, outcomeCounts, plans] = await Promise.all([
      learnerRepository.findManyByIds(learnerIds),
      analyticsRepository.sessionsForLearners(learnerIds),
      analyticsRepository.activeAssignmentsForLearners(learnerIds),
      analyticsRepository.outcomeStatusCountsByLearner(learnerIds),
      analyticsRepository.latestPlansForLearners(learnerIds),
    ]);

    // `plans` is ordered `createdAt desc` — the first row seen per learner is their latest.
    const latestPlanStatusByLearner = new Map<string, LearnerPerformanceRow['planStatus']>();
    for (const plan of plans) {
      if (!latestPlanStatusByLearner.has(plan.learnerId)) {
        latestPlanStatusByLearner.set(
          plan.learnerId,
          plan.status as LearnerPerformanceRow['planStatus'],
        );
      }
    }

    const assignmentByLearner = new Map(assignments.map((a) => [a.learnerId, a]));
    const levelIds = [...new Set(assignments.map((a) => a.levelId))];
    const trackIds = [...new Set(assignments.map((a) => a.trackId))];
    const [levels, tracks] = await Promise.all([
      levelRepository.findManyByIdsScoped(levelIds),
      trackRepository.findManyByIds(trackIds),
    ]);
    const levelById = new Map(levels.map((l) => [l.id, l]));
    const trackById = new Map(tracks.map((t) => [t.id, t]));

    const outcomesByLearner = new Map<string, { achieved: number; total: number }>();
    for (const row of outcomeCounts) {
      const bucket = outcomesByLearner.get(row.learnerId) ?? { achieved: 0, total: 0 };
      bucket.total += row._count._all;
      if (row.status === 'ACHIEVED') bucket.achieved += row._count._all;
      outcomesByLearner.set(row.learnerId, bucket);
    }

    return learners
      .filter((learner) => learner !== null)
      .map((learner) => {
        const learnerSessions = sessions.filter((s) => s.learnerId === learner.id);
        const attended = learnerSessions.filter((s) => s.status === 'COMPLETED');
        const outcomes = outcomesByLearner.get(learner.id) ?? { achieved: 0, total: 0 };
        const assignment = assignmentByLearner.get(learner.id);
        const level = assignment ? (levelById.get(assignment.levelId) ?? null) : null;
        const track = assignment ? (trackById.get(assignment.trackId) ?? null) : null;
        const completedScores = attended
          .map((s) => s.score)
          .filter((score): score is number => score !== null);
        const avgScore = average(completedScores);

        return {
          learnerId: learner.id,
          displayName: learner.displayName,
          levelNameEn: level?.nameEn ?? null,
          levelNameAr: level?.nameAr ?? null,
          trackNameEn: track?.nameEn ?? null,
          trackNameAr: track?.nameAr ?? null,
          sessionsAttended: attended.length,
          sessionsScheduled: learnerSessions.length,
          averageScore: avgScore,
          outcomesAchieved: outcomes.achieved,
          outcomesTotal: outcomes.total,
          status: statusFor(attended.length, avgScore),
          planStatus: latestPlanStatusByLearner.get(learner.id) ?? null,
        };
      });
  }

  /** `PF-01`, `PF-03` — one team's roster with per-member stats. Team ownership is enforced by the route's `requireTeamAccess` guard, not here. */
  async teamPerformance(teamId: string): Promise<TeamPerformanceResponseDto> {
    const team = await teamRepository.findByIdScoped(teamId);
    if (!team) throw new NotFoundError('Team not found');

    const learnerIds = await analyticsRepository.learnerIdsForTeam(teamId);
    const learners = await this.learnerRows(learnerIds);

    const scores = learners.map((l) => l.averageScore).filter((s): s is number => s !== null);
    const totalOutcomes = learners.reduce((sum, l) => sum + l.outcomesTotal, 0);
    const achievedOutcomes = learners.reduce((sum, l) => sum + l.outcomesAchieved, 0);

    return {
      teamId,
      learnerCount: learners.length,
      averageScore: average(scores),
      outcomeAchievementRate: totalOutcomes === 0 ? null : achievedOutcomes / totalOutcomes,
      learners,
    };
  }

  /** `PF-02` — Admin-only, every team in the org. Route enforces `authorize('ADMIN')`. */
  async organizationPerformance(): Promise<OrganizationPerformanceResponseDto> {
    const teams = await teamRepository.findAllInOrganization();

    const perTeam = await Promise.all(
      teams.map(async (team) => {
        const perf = await this.teamPerformance(team.id);
        return { ...perf, teamName: team.name };
      }),
    );

    const scores = perTeam.map((t) => t.averageScore).filter((s): s is number => s !== null);
    const totalOutcomes = perTeam.reduce(
      (sum, t) => sum + t.learners.reduce((s, l) => s + l.outcomesTotal, 0),
      0,
    );
    const achievedOutcomes = perTeam.reduce(
      (sum, t) => sum + t.learners.reduce((s, l) => s + l.outcomesAchieved, 0),
      0,
    );

    return {
      teamCount: teams.length,
      learnerCount: perTeam.reduce((sum, t) => sum + t.learnerCount, 0),
      averageScore: average(scores),
      outcomeAchievementRate: totalOutcomes === 0 ? null : achievedOutcomes / totalOutcomes,
      teams: perTeam.map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        learnerCount: t.learnerCount,
        averageScore: t.averageScore,
        outcomeAchievementRate: t.outcomeAchievementRate,
      })),
    };
  }
}

export const performanceService = new PerformanceService();
