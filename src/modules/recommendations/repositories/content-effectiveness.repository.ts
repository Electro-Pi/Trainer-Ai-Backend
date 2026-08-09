import type { ContentEffectiveness } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { ContentEffectiveness };

interface EffectivenessStatsRow {
  contentItemId: string;
  outcomeId: string;
  timesDelivered: bigint;
  timesAchieved: bigint;
}

type ContentEffectivenessDelegate = typeof prisma.contentEffectiveness;

/** Recomputed by `recompute-effectiveness.job` (nightly cron), never inline (`RC-13`). */
export class ContentEffectivenessRepository extends BaseRepository<
  ContentEffectiveness,
  ContentEffectivenessDelegate
> {
  constructor() {
    super(prisma.contentEffectiveness, 'lastComputedAt');
  }

  async findByContentAndOutcome(
    contentItemId: string,
    outcomeId: string,
  ): Promise<ContentEffectiveness | null> {
    return this.delegate.findFirst({ where: { contentItemId, outcomeId } });
  }

  /**
   * `RC-13`, `recompute-effectiveness.job` (P10-5) — one row per
   * `(contentItemId, outcomeId)` pair delivered at least once in this org,
   * counting delivered `SessionContent` against the matching outcome's
   * `SessionOutcome.verdict` on the same session. The aggregate itself is raw
   * SQL with an explicit `organizationId` predicate (AGENTS rule 8, join has
   * no tenant-scoped column to filter on directly); each row is then upserted
   * through Prisma so new rows get a `cuid(2)` id like every other table
   * instead of a mismatched id scheme from a bulk SQL insert.
   */
  async recomputeForOrganization(organizationId: string): Promise<number> {
    const stats = await prisma.$queryRaw<EffectivenessStatsRow[]>`
      SELECT
        sc."contentItemId" AS "contentItemId",
        so."outcomeId" AS "outcomeId",
        count(*) FILTER (WHERE sc."deliveredAt" IS NOT NULL) AS "timesDelivered",
        count(*) FILTER (WHERE sc."deliveredAt" IS NOT NULL AND so."verdict" = 'ACHIEVED') AS "timesAchieved"
      FROM "session_contents" sc
      JOIN "sessions" s ON s."id" = sc."sessionId"
      JOIN "session_outcomes" so ON so."sessionId" = s."id"
      WHERE s."organizationId" = ${organizationId}
      GROUP BY sc."contentItemId", so."outcomeId"
    `;

    for (const row of stats) {
      const timesDelivered = Number(row.timesDelivered);
      const timesAchieved = Number(row.timesAchieved);
      const effectivenessScore = timesDelivered === 0 ? 0 : timesAchieved / timesDelivered;

      await prisma.contentEffectiveness.upsert({
        where: {
          contentItemId_outcomeId: {
            contentItemId: row.contentItemId,
            outcomeId: row.outcomeId,
          },
        },
        create: {
          contentItemId: row.contentItemId,
          outcomeId: row.outcomeId,
          timesDelivered,
          timesAchieved,
          effectivenessScore,
          lastComputedAt: new Date(),
        },
        update: { timesDelivered, timesAchieved, effectivenessScore, lastComputedAt: new Date() },
      });
    }

    return stats.length;
  }
}
