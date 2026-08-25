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

  /**
   * Batched form of `findByIdScoped`. `Level` has no `organizationId` column
   * so it's outside `TENANT_SCOPED_MODELS` — a plain `id: { in }` findMany
   * would return rows across every org that happens to share one of these
   * ids, so the `track.organizationId` join must be applied here too.
   */
  async findManyByIdsScoped(ids: string[]): Promise<Level[]> {
    if (ids.length === 0) return [];
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('findManyByIdsScoped() called outside runWithTenant()');
    }
    return this.delegate.findMany({ where: { id: { in: ids }, track: { organizationId } } });
  }

  async findByTrackAndKey(trackId: string, key: string): Promise<Level | null> {
    return this.delegate.findFirst({ where: { trackId, key } });
  }

  /** Mirrors `TrackRepository.hasChildren` — a level with any real data attached (outcomes, content, plan templates, or a learner ever assigned to it) can't be hard-deleted, only archived. Content is reached through the level's skills — `ContentItem` no longer carries its own `levelId`. */
  async hasChildren(id: string): Promise<boolean> {
    const [outcomeCount, contentCount, templateCount, assignmentCount] = await Promise.all([
      prisma.outcome.count({ where: { levelId: id } }),
      prisma.contentItem.count({ where: { skill: { levelId: id } } }),
      prisma.planTemplate.count({ where: { levelId: id } }),
      prisma.learnerAssignment.count({ where: { levelId: id } }),
    ]);
    return outcomeCount > 0 || contentCount > 0 || templateCount > 0 || assignmentCount > 0;
  }

  /**
   * `P4-6` — transactional reorder within one track; `order` must be exactly
   * that track's levels, verified by the caller. Two-phase: `(trackId,
   * order)` is a non-deferred unique constraint, so writing final positions
   * directly can collide mid-transaction with a row that hasn't moved off
   * its old slot yet (e.g. swapping two levels). Offsetting every row past
   * the max possible index first guarantees no intermediate collision.
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
