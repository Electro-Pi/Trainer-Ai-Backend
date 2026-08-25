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
  /** Every outcome this session covers besides `primaryOutcomeId` — a skill grouped into one session covers several; written as non-carried-over `SessionOutcome` rows. */
  outcomeIds: string[];
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

      // `input.outcomeIds` — the skill's own outcomes this session was built
      // to cover (primary plus the rest of the skill) — are never carried
      // over; `carriedOverOutcomeIds` (outstanding from *other* skills'
      // past attempts) are the only rows marked `isCarriedOver`. A carried-
      // over id that happens to already be one of the skill's own outcomes
      // stays non-carried-over (its own-outcome membership wins).
      const ownOutcomeIds = new Set([input.primaryOutcomeId, ...input.outcomeIds]);
      const carriedOverIds = new Set(
        input.carriedOverOutcomeIds.filter((id) => !ownOutcomeIds.has(id)),
      );
      const sessionOutcomeRows = [
        ...[...ownOutcomeIds].map((outcomeId) => ({ outcomeId, isCarriedOver: false })),
        ...[...carriedOverIds].map((outcomeId) => ({ outcomeId, isCarriedOver: true })),
      ];
      await Promise.all(
        sessionOutcomeRows.map((row) =>
          tx.sessionOutcome.create({
            data: {
              sessionId: session.id,
              outcomeId: row.outcomeId,
              isCarriedOver: row.isCarriedOver,
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

  /**
   * Excludes CANCELLED — a reschedule inside `suggest()`'s replace flow (or a
   * plan-edit `suggest()` re-run) cancels the old row rather than deleting
   * it, so a plan can accumulate CANCELLED ghosts at the same `sequence` as
   * the session that superseded them. Every caller (wizard session list,
   * coverage, confirm, cancel, report summary) wants the plan's live
   * sessions, never those ghosts — a caller that genuinely needs full
   * history should query status-unfiltered explicitly instead.
   */
  async findByPlan(planId: string): Promise<Session[]> {
    return this.delegate.findMany({
      where: { planId, status: { not: 'CANCELLED' } },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  /**
   * Batched delete for replacing a plan's suggested sessions — one query
   * instead of one `delete()` per session.
   *
   * Excludes any session with a `graphEventId`: `TrainingPlanService.suggest`
   * calls `SessionService.cancel` on those first, which only *enqueues* a
   * `meeting.update` cancel job (Graph calls never happen inline on a
   * request path, per `IV-01`) — it returns before that job actually runs.
   * Deleting the row here immediately after would race the job's own
   * `findByIdScoped` lookup: if the row is already gone by the time the
   * worker picks up the job, it finds nothing and skips, and the real Teams
   * meeting on Microsoft's side is never cancelled — orphaned forever, still
   * showing on the learner's calendar. Leaving the (already `CANCELLED`)
   * row in place costs nothing — it's just history once the meeting's
   * actually cancelled — and lets that job find it.
   */
  async deleteByPlan(planId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { planId, graphEventId: null } });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<Session | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /**
   * The AI Trainer webhook (`POST /external-sessions/:id/complete`) has no
   * auth at all, so no `req.auth.orgId` to seed `runWithTenant` with before
   * the first read — same two-step unscoped→scoped reasoning as
   * `findByJoinToken`/`findOrganizationIdForSession`, keyed on
   * `externalSessionId` instead.
   */
  async findByExternalSessionId(externalSessionId: string): Promise<Session | null> {
    const unscoped = await prisma.$queryRaw<
      { id: string; organizationId: string }[]
    >`SELECT "id", "organizationId" FROM "sessions" WHERE "externalSessionId" = ${externalSessionId} LIMIT 1`;

    const match = unscoped[0];
    if (!match) return null;

    return runWithTenant(match.organizationId, () =>
      this.delegate.findFirst({ where: { id: match.id } }),
    );
  }

  /**
   * `IV-01`, `IV-02` — one atomic write: marks the session `INVITED` with its
   * Graph meeting details, and creates the matching `Invitation` row.
   * Without a transaction, a mid-write failure could leave a session with
   * `graphEventId` set but no `Invitation` (or vice versa) — a real Teams
   * meeting the portal doesn't know how to track RSVP/attendance for.
   */
  /**
   * Stamps just `graphEventId`, nothing else — for the case where Graph's
   * calendar event was created but its Teams `joinUrl` never showed up
   * (`GraphMeetingCreatedWithoutJoinUrlError`). Deliberately doesn't touch
   * `status`/`joinUrl`/`Invitation` the way `recordMeetingCreated` does:
   * the invite email/confirmation hasn't gone out yet, so this session isn't
   * really `INVITED`. Its only job is making the event id visible so
   * `create-meeting.job.ts`'s `if (session.graphEventId)` guard recognizes
   * the event already exists on the next retry, instead of calling
   * `POST /me/events` again and creating a duplicate.
   */
  async recordGraphEventOnly(sessionId: string, graphEventId: string): Promise<void> {
    await this.delegate.update({
      where: { id: sessionId } as never,
      data: { graphEventId } as never,
    });
  }

  /**
   * Links this session to the AI Trainer microservice's own session id —
   * stamped once `create-meeting.job.ts` successfully dispatches to
   * `POST /sessions/external`. The only way `ReportDataService` can later
   * resolve which `GET /sessions/{id}/evaluation` (or `/transcript`) payload
   * belongs to this session; nothing else links the two systems' ids.
   */
  async recordExternalSessionId(sessionId: string, externalSessionId: string): Promise<void> {
    await this.delegate.update({
      where: { id: sessionId } as never,
      data: { externalSessionId } as never,
    });
  }

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
