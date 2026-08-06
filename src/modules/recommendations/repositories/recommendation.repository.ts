import type { Recommendation } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type RecommendationDelegate = typeof prisma.recommendation;

export class RecommendationRepository extends BaseRepository<
  Recommendation,
  RecommendationDelegate
> {
  constructor() {
    super(prisma.recommendation, 'generatedAt');
  }

  async findByLearner(learnerId: string): Promise<Recommendation[]> {
    return this.delegate.findMany({ where: { learnerId }, orderBy: { generatedAt: 'desc' } });
  }
}
