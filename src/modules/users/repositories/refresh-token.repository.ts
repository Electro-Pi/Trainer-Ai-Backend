import type { RefreshToken } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type RefreshTokenDelegate = typeof prisma.refreshToken;

/**
 * Not tenant-scoped directly — `RefreshToken` has no `organizationId` column
 * (it hangs off `userId`, whose owning `PortalUser` is itself tenant-scoped).
 * Reuse-detection (AU-06, P2-3) revokes an entire `familyId` on replay.
 */
export class RefreshTokenRepository extends BaseRepository<RefreshToken, RefreshTokenDelegate> {
  constructor() {
    super(prisma.refreshToken, 'createdAt');
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.delegate.findFirst({ where: { tokenHash } });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * `cleanup.job` (§10.1) — expired or revoked tokens past `cutoff` are pure
   * by-products (never a business record), so hard-delete in bounded batches
   * rather than the deactivate/archive pattern non-negotiable 17 requires for
   * actual records. Returns the number deleted for the sweep's audit row.
   */
  async deleteExpiredOrRevokedBefore(cutoff: Date, batchSize: number): Promise<number> {
    const stale = await this.delegate.findMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
      take: batchSize,
    });
    if (stale.length === 0) return 0;

    await prisma.refreshToken.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
    return stale.length;
  }
}
