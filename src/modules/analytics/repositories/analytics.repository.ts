import { prisma } from '@/database/prisma.service.js';

/**
 * `PF-01`…`PF-09` — read-only aggregate queries. Deliberately not a
 * `BaseRepository` subclass: analytics has no single owning entity, it reads
 * across `Learner`, `LearnerOutcome`, `Session`, `Assessment` and
 * `ContentEffectiveness`. `LearnerOutcome`/`Assessment`/`AssessmentAnswer`
 * carry no `organizationId` column (§7.3) — every query here is scoped by
 * first resolving the caller's `learnerId` set through the tenant-scoped
 * `Learner` model, then filtering the unscoped models by `learnerId: {in}`,
 * matching the established `learnerOutcomeRepository` "not directly
 * tenant-scoped" convention.
 */
export class AnalyticsRepository {
  async learnerIdsForTeam(teamId: string): Promise<string[]> {
    const learners = await prisma.learner.findMany({
      where: { teamId, status: { not: 'REMOVED' } },
      select: { id: true },
    });
    return learners.map((l) => l.id);
  }

  async learnerIdsForOrganization(): Promise<string[]> {
    const learners = await prisma.learner.findMany({
      where: { status: { not: 'REMOVED' } },
      select: { id: true },
    });
    return learners.map((l) => l.id);
  }

  async outcomeStatusCounts(
    learnerIds: string[],
  ): Promise<{ status: string; _count: { _all: number } }[]> {
    if (learnerIds.length === 0) return [];
    return prisma.learnerOutcome.groupBy({
      by: ['status'],
      where: { learnerId: { in: learnerIds } },
      _count: { _all: true },
    });
  }

  async outcomeStatusCountsByLearner(
    learnerIds: string[],
  ): Promise<{ learnerId: string; status: string; _count: { _all: number } }[]> {
    if (learnerIds.length === 0) return [];
    return prisma.learnerOutcome.groupBy({
      by: ['learnerId', 'status'],
      where: { learnerId: { in: learnerIds } },
      _count: { _all: true },
    });
  }

  async sessionsForLearners(
    learnerIds: string[],
    range?: { from?: Date; to?: Date },
  ): Promise<
    {
      id: string;
      learnerId: string;
      status: string;
      verdict: string | null;
      score: number | null;
      scheduledStart: Date;
      endedAt: Date | null;
      primaryOutcomeId: string;
    }[]
  > {
    if (learnerIds.length === 0) return [];
    return prisma.session.findMany({
      where: {
        learnerId: { in: learnerIds },
        ...(range?.from || range?.to
          ? {
              scheduledStart: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        learnerId: true,
        status: true,
        verdict: true,
        score: true,
        scheduledStart: true,
        endedAt: true,
        primaryOutcomeId: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  async activeAssignmentsForLearners(
    learnerIds: string[],
  ): Promise<{ learnerId: string; trackId: string; levelId: string }[]> {
    if (learnerIds.length === 0) return [];
    return prisma.learnerAssignment.findMany({
      where: { learnerId: { in: learnerIds }, isActive: true },
      select: { learnerId: true, trackId: true, levelId: true },
    });
  }

  /**
   * `PF-01` — one row per learner: their most recently created `TrainingPlan`
   * (there is no "current plan" pointer anywhere else in the schema, so
   * "most recent by createdAt" is the closest thing to it). Query is a
   * single `findMany` ordered so the first row per `learnerId` — picked in
   * the caller, since Prisma has no `DISTINCT ON` — is the latest one.
   */
  async latestPlansForLearners(
    learnerIds: string[],
  ): Promise<{ learnerId: string; status: string; createdAt: Date }[]> {
    if (learnerIds.length === 0) return [];
    return prisma.trainingPlan.findMany({
      where: { learnerId: { in: learnerIds } },
      select: { learnerId: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async outcomesWithSkillTags(
    outcomeIds: string[],
  ): Promise<{ id: string; targetSkills: string[]; levelId: string }[]> {
    if (outcomeIds.length === 0) return [];
    return prisma.outcome.findMany({
      where: { id: { in: outcomeIds } },
      select: { id: true, targetSkills: true, levelId: true },
    });
  }

  async contentUsage(organizationId: string): Promise<
    {
      contentItemId: string;
      title: string;
      contentType: string;
      trackId: string;
      levelId: string;
      timesDelivered: number;
      timesAchieved: number;
      effectivenessScore: number;
    }[]
  > {
    const rows = await prisma.contentEffectiveness.findMany({
      where: { contentItem: { organizationId } },
      include: {
        contentItem: { select: { title: true, contentType: true, trackId: true, levelId: true } },
      },
      orderBy: { effectivenessScore: 'desc' },
    });
    return rows.map((row) => ({
      contentItemId: row.contentItemId,
      title: row.contentItem.title,
      contentType: row.contentItem.contentType,
      trackId: row.contentItem.trackId,
      levelId: row.contentItem.levelId,
      timesDelivered: row.timesDelivered,
      timesAchieved: row.timesAchieved,
      effectivenessScore: row.effectivenessScore,
    }));
  }
}

export const analyticsRepository = new AnalyticsRepository();
