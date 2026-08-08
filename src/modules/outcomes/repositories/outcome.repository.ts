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

  /**
   * `P4-6` — transactional reorder within one level. Two-phase for the same
   * reason as `LevelRepository.reorder`: `(levelId, order)` is a
   * non-deferred unique constraint, so intermediate collisions are possible
   * writing final positions directly.
   */
  async reorder(order: string[]): Promise<void> {
    const offset = order.length + 1000;
    await prisma.$transaction([
      ...order.map((id, index) =>
        this.delegate.update({ where: { id } as never, data: { order: offset + index } as never }),
      ),
      ...order.map((id, index) =>
        this.delegate.update({ where: { id } as never, data: { order: index } as never }),
      ),
    ]);
  }
}
