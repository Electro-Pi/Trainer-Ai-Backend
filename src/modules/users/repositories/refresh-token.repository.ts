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
}
