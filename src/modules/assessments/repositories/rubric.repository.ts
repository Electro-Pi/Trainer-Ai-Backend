import type { Rubric } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Rubric };

type RubricDelegate = typeof prisma.rubric;

export class RubricRepository extends BaseRepository<Rubric, RubricDelegate> {
  constructor() {
    super(prisma.rubric, 'createdAt');
  }

  async findActiveByOutcome(outcomeId: string): Promise<Rubric | null> {
    return this.delegate.findFirst({ where: { outcomeId, isActive: true } });
  }
}
