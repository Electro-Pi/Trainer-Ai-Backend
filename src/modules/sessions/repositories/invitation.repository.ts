import type { Invitation } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

export type { Invitation };

type InvitationDelegate = typeof prisma.invitation;

export class InvitationRepository extends BaseRepository<Invitation, InvitationDelegate> {
  constructor() {
    super(prisma.invitation, 'sentAt');
  }

  async findBySession(sessionId: string): Promise<Invitation | null> {
    return this.delegate.findFirst({ where: { sessionId } });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<Invitation | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /**
   * `IV-03` — the Graph RSVP webhook arrives with a `graphEventId`, not our
   * own id, and (like the agent's `joinToken` entry point) carries no
   * `organizationId` claim to seed the tenant context with. Returns the
   * resolved `organizationId` alongside the row (rather than resolving the
   * row from *inside* a transient `runWithTenant` call that ends before the
   * caller can use it) so the caller can re-enter `runWithTenant` itself for
   * every subsequent write in the same request.
   */
  async findByGraphEventId(
    graphEventId: string,
  ): Promise<{ invitation: Invitation; organizationId: string } | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT i."id", s."organizationId"
      FROM "invitations" i
      JOIN "sessions" s ON s."id" = i."sessionId"
      WHERE i."graphEventId" = ${graphEventId} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    const invitation = await runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
    if (!invitation) return null;

    return { invitation, organizationId: match.organizationId };
  }

  /**
   * `IV-09` — attendance is a fact the AI agent reports (it's the one
   * actually in the meeting, `LS-01`), not something we poll Graph's
   * attendance-report API for. This is the write path P8's dispatch/session
   * API calls into once it exists; `joinedAt`/`leftAt` set the derived
   * `attendanceMinutes` when both are known.
   */
  async recordAttendance(
    id: string,
    input: { joinedAt?: Date; leftAt?: Date },
  ): Promise<Invitation> {
    const existing = await this.delegate.findFirst({ where: { id } });
    const joinedAt = input.joinedAt ?? existing?.joinedAt ?? null;
    const leftAt = input.leftAt ?? existing?.leftAt ?? null;
    const attendanceMinutes =
      joinedAt && leftAt ? Math.round((leftAt.getTime() - joinedAt.getTime()) / 60_000) : null;

    return this.delegate.update({
      where: { id } as never,
      data: { joinedAt, leftAt, attendanceMinutes } as never,
    });
  }
}
