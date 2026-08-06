import type { RecommendationItem } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type RecommendationItemDelegate = typeof prisma.recommendationItem;

/** Not directly tenant-scoped — reached via `recommendationId` → `Recommendation.organizationId`. */
export class RecommendationItemRepository extends BaseRepository<
  RecommendationItem,
  RecommendationItemDelegate
> {
  constructor() {
    super(prisma.recommendationItem, 'rank');
  }

  async findByRecommendation(recommendationId: string): Promise<RecommendationItem[]> {
    return this.delegate.findMany({ where: { recommendationId }, orderBy: { rank: 'asc' } });
  }
}
