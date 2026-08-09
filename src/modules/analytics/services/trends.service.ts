import type { TrendPointDto, TrendsResponseDto } from '../dto/analytics.dto.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';

export interface TrendsQuery {
  teamId?: string;
  trackId?: string;
  levelId?: string;
  from?: Date;
  to?: Date;
  granularity: 'week' | 'month';
}

function periodStart(date: Date, granularity: 'week' | 'month'): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === 'month') {
    d.setUTCDate(1);
    return d.toISOString().slice(0, 10);
  }
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

/** `PF-06`, `PF-09` — score trend over time, filterable by team/track/level/date range (`analyticsFilterQuerySchema`). */
export class TrendsService {
  async trends(query: TrendsQuery): Promise<TrendsResponseDto> {
    const learnerIds = query.teamId
      ? await analyticsRepository.learnerIdsForTeam(query.teamId)
      : await analyticsRepository.learnerIdsForOrganization();

    let scopedLearnerIds = learnerIds;
    if (query.trackId || query.levelId) {
      const assignments = await analyticsRepository.activeAssignmentsForLearners(learnerIds);
      const matching = new Set(
        assignments
          .filter(
            (a) =>
              (!query.trackId || a.trackId === query.trackId) &&
              (!query.levelId || a.levelId === query.levelId),
          )
          .map((a) => a.learnerId),
      );
      scopedLearnerIds = learnerIds.filter((id) => matching.has(id));
    }

    const sessions = await analyticsRepository.sessionsForLearners(scopedLearnerIds, {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
    const completed = sessions.filter((s) => s.status === 'COMPLETED');

    const buckets = new Map<string, { scores: number[]; achieved: number; count: number }>();
    for (const session of completed) {
      const key = periodStart(session.scheduledStart, query.granularity);
      const bucket = buckets.get(key) ?? { scores: [], achieved: 0, count: 0 };
      bucket.count += 1;
      if (session.score !== null) bucket.scores.push(session.score);
      if (session.verdict === 'ACHIEVED') bucket.achieved += 1;
      buckets.set(key, bucket);
    }

    const points: TrendPointDto[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, bucket]) => ({
        periodStart: start,
        averageScore:
          bucket.scores.length === 0
            ? null
            : bucket.scores.reduce((sum, s) => sum + s, 0) / bucket.scores.length,
        sessionsCompleted: bucket.count,
        outcomesAchieved: bucket.achieved,
      }));

    return { granularity: query.granularity, points };
  }
}

export const trendsService = new TrendsService();
