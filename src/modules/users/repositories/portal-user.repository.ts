import type { PortalUser } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

// Re-exported so services (banned from importing `@prisma/client` directly
// — D-12b) can still type against the model shape this repository returns.
export type { PortalUser };

type PortalUserDelegate = typeof prisma.portalUser;

export class PortalUserRepository extends BaseRepository<PortalUser, PortalUserDelegate> {
  constructor() {
    super(prisma.portalUser, 'createdAt');
  }

  /**
   * Sign-in resolution (`AU-01`/`AU-07`) has no `organizationId` yet — that's
   * exactly what these two lookups discover. Same two-step unscoped→scoped
   * resolve as `SessionRepository.findByJoinToken`: a raw lookup narrowed to
   * one unique-ish column just to find the owning org, then re-enter
   * `runWithTenant` for the real, tenant-scoped read. `email` is only unique
   * per-org (`@@unique([organizationId, email])`), so multiple orgs can
   * share an email — this returns the first match, same as a bare
   * `findFirst` would without a tenant filter.
   */
  async findByEmail(email: string): Promise<PortalUser | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "portal_users" WHERE "email" = ${email} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  async findByEntraObjectId(entraObjectId: string): Promise<PortalUser | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "portal_users" WHERE "entraObjectId" = ${entraObjectId} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * still refuses outside `runWithTenant` (it just can't merge
   * `organizationId` into a unique `where`, per the extension's own doc
   * comment — that's a different thing from being exempt from the guard).
   * `/auth/me` and refresh-token rotation resolve a user **by id alone**,
   * before any tenant context exists, so they need this same two-step
   * unscoped→scoped resolve rather than `findById`.
   */
  async findByIdUnscoped(id: string): Promise<PortalUser | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "portal_users" WHERE "id" = ${id} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  /**
   * For callers that already have an active tenant context (`req.auth`
   * exists) and need to verify a request-supplied user id belongs to the
   * caller's own org — e.g. `teams` validating a `managerId` — `findFirst`
   * IS scoped by the tenant extension, unlike `findById`/`findUnique`.
   */
  async findByIdScoped(id: string): Promise<PortalUser | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
