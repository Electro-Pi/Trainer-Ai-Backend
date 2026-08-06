import type { Level } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

export type { Level };

type LevelDelegate = typeof prisma.level;

/** Not directly tenant-scoped — reached via `trackId` → `Track.organizationId`. */
export class LevelRepository extends BaseRepository<Level, LevelDelegate> {
  constructor() {
    super(prisma.level, 'order');
  }

  async findByTrack(trackId: string): Promise<Level[]> {
    return this.delegate.findMany({ where: { trackId }, orderBy: { order: 'asc' } });
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which is unscoped even for
   * models the tenant extension DOES cover — `Level` isn't one of those
   * anyway (no direct `organizationId` column), so a request-supplied
   * `levelId` must be verified against the caller's org by joining through
   * `track.organizationId` explicitly, or a MANAGER in org A could assign a
   * learner to org B's level.
   */
  async findByIdScoped(id: string): Promise<Level | null> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('findByIdScoped() called outside runWithTenant()');
    }
    return this.delegate.findFirst({ where: { id, track: { organizationId } } });
  }
}
