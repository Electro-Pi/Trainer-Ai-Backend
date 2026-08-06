import type { Outcome } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

export type { Outcome };

type OutcomeDelegate = typeof prisma.outcome;

/** Not directly tenant-scoped — reached via `levelId` → `trackId` → `Track.organizationId`. */
export class OutcomeRepository extends BaseRepository<Outcome, OutcomeDelegate> {
  constructor() {
    super(prisma.outcome, 'order');
  }

  async findByLevel(levelId: string): Promise<Outcome[]> {
    return this.delegate.findMany({ where: { levelId }, orderBy: { order: 'asc' } });
  }

  /** Same tenant-verification need as `LevelRepository.findByIdScoped` — see its doc comment. */
  async findByIdScoped(id: string): Promise<Outcome | null> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('findByIdScoped() called outside runWithTenant()');
    }
    return this.delegate.findFirst({ where: { id, level: { track: { organizationId } } } });
  }
}
