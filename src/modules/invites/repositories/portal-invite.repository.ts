import type { PortalInvite } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

export type { PortalInvite };

type PortalInviteDelegate = typeof prisma.portalInvite;

export class PortalInviteRepository extends BaseRepository<PortalInvite, PortalInviteDelegate> {
  constructor() {
    super(prisma.portalInvite, 'createdAt');
  }

  /**
   * Invite-accept resolution (`AuthService.signInWithMicrosoft`) has no
   * tenant context yet — same two-step unscoped→scoped shape as
   * `PortalUserRepository.findByEntraObjectId`: a raw lookup by `token` just
   * to discover the owning org, then a real tenant-scoped read.
   */
  async findByTokenUnscoped(token: string): Promise<PortalInvite | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "portal_invites" WHERE "token" = ${token} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  /** Called from an already-authenticated ADMIN request — `tenantScope()` has already bound the tenant context. */
  async findByOrganization(organizationId: string): Promise<PortalInvite[]> {
    return this.delegate.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
