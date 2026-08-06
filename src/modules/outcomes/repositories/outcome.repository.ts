import type { Outcome } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type OutcomeDelegate = typeof prisma.outcome;

/** Not directly tenant-scoped — reached via `levelId` → `trackId` → `Track.organizationId`. */
export class OutcomeRepository extends BaseRepository<Outcome, OutcomeDelegate> {
  constructor() {
    super(prisma.outcome, 'order');
  }

  async findByLevel(levelId: string): Promise<Outcome[]> {
    return this.delegate.findMany({ where: { levelId }, orderBy: { order: 'asc' } });
  }
}
