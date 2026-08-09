import { randomBytes } from 'node:crypto';

import type { Session } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

export type { Session };

type SessionDelegate = typeof prisma.session;

export interface CreateSessionInput {
  organizationId: string;
  planId: string;
  learnerId: string;
  primaryOutcomeId: string;
  sequence: number;
  scheduledStart: Date;
  scheduledEnd: Date;
  durationMinutes: number;
  carriedOverOutcomeIds: string[];
  contentItemIds: string[];
}

export function generateJoinToken(): string {
  // `IV-04` — unique, unguessable, bound to exactly one session and learner.
  return randomBytes(32).toString('base64url');
}

export class SessionRepository extends BaseRepository<Session, SessionDelegate> {
  constructor() {
    super(prisma.session, 'scheduledStart');
  }

  /**
   * `TP-02`, `TP-03` — one atomic write: the `Session` row, its primary
   * outcome plus any carried-over outcomes as `SessionOutcome` rows, and its
   * ordered `SessionContent` set. Lives on the repository (D-12b) since
   * `BaseRepository` has no transaction primitive.
   */
  async createWithContent(input: CreateSessionInput): Promise<Session> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          organizationId: input.organizationId,
          planId: input.planId,
          learnerId: input.learnerId,
          primaryOutcomeId: input.primaryOutcomeId,
          sequence: input.sequence,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          durationMinutes: input.durationMinutes,
          joinToken: generateJoinToken(),
        },
      });

      const outcomeIds = new Set([input.primaryOutcomeId, ...input.carriedOverOutcomeIds]);
      await Promise.all(
        [...outcomeIds].map((outcomeId) =>
          tx.sessionOutcome.create({
            data: {
              sessionId: session.id,
              outcomeId,
              isCarriedOver: outcomeId !== input.primaryOutcomeId,
            },
          }),
        ),
      );

      await Promise.all(
        input.contentItemIds.map((contentItemId, index) =>
          tx.sessionContent.create({
            data: { sessionId: session.id, contentItemId, order: index, source: 'RECOMMENDED' },
          }),
        ),
      );

      return session;
    });
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

  /**
   * The Agent Session API's write path (`P8-4`…`P8-8`) authenticates via a
   * service token, not a portal-user JWT — there is no `req.auth.orgId` to
   * seed `runWithTenant` with before the first tenant-scoped read. Same
   * two-step unscoped→scoped reasoning as `findByJoinToken`, narrowed to a
   * single `id` lookup instead of a token: read the `organizationId` raw,
   * then re-enter `runWithTenant` for the real, tenant-scoped row.
   */
  async findOrganizationIdForSession(
    id: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    const rows = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "sessions" WHERE "id" = ${id} LIMIT 1`;
    return rows[0] ?? null;
  }

  async findByPlan(planId: string): Promise<Session[]> {
    return this.delegate.findMany({ where: { planId }, orderBy: { scheduledStart: 'asc' } });
  }

  /** Batched delete for replacing a DRAFT plan's suggested sessions — one query instead of one `delete()` per session. */
  async deleteByPlan(planId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { planId } });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<Session | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /**
   * `IV-01`, `IV-02` — one atomic write: marks the session `INVITED` with its
   * Graph meeting details, and creates the matching `Invitation` row.
   * Without a transaction, a mid-write failure could leave a session with
   * `graphEventId` set but no `Invitation` (or vice versa) — a real Teams
   * meeting the portal doesn't know how to track RSVP/attendance for.
   */
  async recordMeetingCreated(
    sessionId: string,
    learnerId: string,
    meeting: { graphEventId: string; joinUrl: string },
  ): Promise<Session> {
    const [session] = await prisma.$transaction([
      this.delegate.update({
        where: { id: sessionId } as never,
        data: {
          graphEventId: meeting.graphEventId,
          joinUrl: meeting.joinUrl,
          status: 'INVITED',
        } as never,
      }),
      prisma.invitation.create({
        data: { sessionId, learnerId, graphEventId: meeting.graphEventId },
      }),
    ]);
    return session;
  }

  /**
   * `P8-8`, ARCHITECTURE §9.1 — the `complete` transaction. One atomic write:
   * `Assessment.totalScore`/`verdict`, every `SessionOutcome.verdict`/`score`
   * for this session (`OT-03`), the `Session` itself (`status`, `verdict`,
   * `score`, `endedAt`), and an audit row — all inside one
   * `prisma.$transaction` so a mid-write failure never leaves, e.g., the
   * `Session` marked `COMPLETED` with no matching `Assessment` verdict.
   * `LearnerOutcome` updates happen in a *separate* transaction
   * (`LearnerOutcomeRepository.applyVerdict`, called per-outcome by the
   * caller) since they're keyed by `(learnerId, outcomeId, assignmentId)`,
   * not `sessionId` — this method only owns the session-shaped half.
   */
  async completeSession(params: {
    sessionId: string;
    assessmentId: string;
    organizationId: string;
    verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
    totalScore: number;
    sessionOutcomeVerdicts: {
      outcomeId: string;
      verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
      score: number;
    }[];
  }): Promise<Session> {
    const [session] = await prisma.$transaction([
      this.delegate.update({
        where: { id: params.sessionId } as never,
        data: {
          status: 'COMPLETED',
          verdict: params.verdict,
          score: params.totalScore,
          endedAt: new Date(),
        } as never,
      }),
      prisma.assessment.update({
        where: { id: params.assessmentId },
        data: { totalScore: params.totalScore, verdict: params.verdict, completedAt: new Date() },
      }),
      ...params.sessionOutcomeVerdicts.map((so) =>
        prisma.sessionOutcome.update({
          where: { sessionId_outcomeId: { sessionId: params.sessionId, outcomeId: so.outcomeId } },
          data: { verdict: so.verdict, score: so.score },
        }),
      ),
      prisma.auditLog.create({
        data: {
          organizationId: params.organizationId,
          actorType: 'AGENT',
          action: 'session.completed',
          entityType: 'Session',
          entityId: params.sessionId,
          after: { verdict: params.verdict, totalScore: params.totalScore },
        },
      }),
    ]);

    return session;
  }

  /** `TP-08` calendar view — filterable by learner/team-via-learnerIds/date range, tenant-scoped via `findMany`. */
  async findForCalendar(params: {
    learnerId?: string;
    learnerIds?: string[];
    from?: Date;
    to?: Date;
  }): Promise<Session[]> {
    return this.delegate.findMany({
      where: {
        ...(params.learnerId ? { learnerId: params.learnerId } : {}),
        ...(params.learnerIds ? { learnerId: { in: params.learnerIds } } : {}),
        ...(params.from || params.to
          ? {
              scheduledStart: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }
}
