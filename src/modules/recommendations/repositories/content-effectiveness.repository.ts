import type { ContentEffectiveness } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { ContentEffectiveness };

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
}
