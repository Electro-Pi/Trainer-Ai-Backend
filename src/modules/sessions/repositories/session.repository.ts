import type { Session } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

type SessionDelegate = typeof prisma.session;

export class SessionRepository extends BaseRepository<Session, SessionDelegate> {
  constructor() {
    super(prisma.session, 'scheduledStart');
  }

  /**
   * The agent's entry point (`GET /agent/sessions/:joinToken/context`, P8-3)
   * resolves a session by its unique unguessable token — never by id
   * (`IV-04`, §7.5) — and arrives through the service-token guard, which has
   * no `req.auth.orgId` to seed the tenant context with (that claim only
   * exists on portal-user JWTs). Two-step resolve: an unscoped raw lookup
   * used *only* to discover which org the token belongs to, then re-enter
   * `runWithTenant` for the real, tenant-scoped read. This is the one
   * deliberate exception to "every query goes through the extension
   * already scoped" (non-negotiable 8) — narrowed to a single unique token
   * column, never exposed as a general unscoped finder.
   */
  async findByJoinToken(joinToken: string): Promise<Session | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "sessions" WHERE "joinToken" = ${joinToken} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  async findByPlan(planId: string): Promise<Session[]> {
    return this.delegate.findMany({ where: { planId }, orderBy: { scheduledStart: 'asc' } });
  }
}
