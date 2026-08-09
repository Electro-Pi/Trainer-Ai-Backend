import type { Recommendation } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Recommendation };

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

  /**
   * `Recommendation` is tenant-scoped (`tenant.extension.ts`), but
   * `BaseRepository.findById()` uses `findUnique`, which the extension
   * cannot merge `organizationId` into (documented exemption) — a
   * request-supplied `recommendationId` must resolve through this
   * `findFirst` instead, or a manager in org A could reach org B's
   * recommendation by guessing a CUID (same class of bug as the P3
   * `findById` cross-tenant leak, MEMORY).
   */
  async findByIdScoped(id: string): Promise<Recommendation | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
