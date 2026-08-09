import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { queueService } from '@/queue/queue-instance.js';

import type { RescheduleSessionDto } from '../dto/session.dto.js';
import { InvitationRepository } from '../repositories/invitation.repository.js';
import type { Session } from '../repositories/session.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);
const REMINDER_LEAD_TIME_MS = 60 * 60_000;

/** `TP-06`, `IV-01`…`IV-09` — session lifecycle after a plan is confirmed. */
export class SessionService {
  private readonly sessions = new SessionRepository();
  private readonly invitations = new InvitationRepository();

  async getById(id: string): Promise<Session> {
    const session = await this.sessions.findByIdScoped(id);
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    return session;
  }

  async list(filters: {
    learnerId?: string;
    teamId?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<Session[]> {
    const learnerIds = filters.teamId
      ? (await learnerRepository.findByTeam(filters.teamId)).map((l) => l.id)
      : undefined;

    const sessions = await this.sessions.findForCalendar({
      ...(filters.learnerId ? { learnerId: filters.learnerId } : {}),
      ...(learnerIds ? { learnerIds } : {}),
      ...(filters.from ? { from: new Date(filters.from) } : {}),
      ...(filters.to ? { to: new Date(filters.to) } : {}),
    });

    return filters.status ? sessions.filter((s) => s.status === filters.status) : sessions;
  }

  /** `TP-08` — same underlying query as `list`, kept as its own method since the calendar view has its own route/response shape (day-grouped by the client). */
  async calendar(filters: {
    learnerId?: string;
    teamId?: string;
    from?: string;
    to?: string;
  }): Promise<Session[]> {
    return this.list(filters);
  }

  /**
   * `TP-06` — updates the `Session` row and, once a meeting already exists,
   * the real Teams meeting's time window too. Refuses on a terminal-status
   * session (`COMPLETED`/`CANCELLED`/`NO_SHOW`) — nothing to reschedule.
   */
  async reschedule(actor: ActingUser, id: string, dto: RescheduleSessionDto): Promise<Session> {
    const session = await this.getById(id);
    if (TERMINAL_STATUSES.has(session.status)) {
      throw new ConflictError('Cannot reschedule a session in a terminal state');
    }

    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(dto.scheduledEnd);
    const durationMinutes = Math.round(
      (scheduledEnd.getTime() - scheduledStart.getTime()) / 60_000,
    );

    const updated = await this.sessions.update(session.id, {
      scheduledStart,
      scheduledEnd,
      durationMinutes,
    } as never);

    if (session.graphEventId) {
      await queueService.enqueue('meeting.update', {
        sessionId: session.id,
        organizationId: actor.organizationId,
      });
    }

    await queueService.removeJob('session.reminder', `session-reminder-${session.id}`);
    const reminderDelayMs = scheduledStart.getTime() - REMINDER_LEAD_TIME_MS - Date.now();
    if (reminderDelayMs > 0) {
      await queueService.enqueue(
        'session.reminder',
        { sessionId: session.id, organizationId: actor.organizationId },
        { jobId: `session-reminder-${session.id}`, delayMs: reminderDelayMs },
      );
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'session.rescheduled',
      entityType: 'Session',
      entityId: session.id,
      before: { scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd },
      after: { scheduledStart, scheduledEnd },
    });

    return updated;
  }

  /** Cancels the session and, if a Teams meeting already exists, cancels it too (best-effort — a Graph failure doesn't block the cancel). */
  async cancel(actor: ActingUser, id: string): Promise<Session> {
    const session = await this.getById(id);
    if (TERMINAL_STATUSES.has(session.status)) {
      throw new ConflictError('Session is already in a terminal state');
    }

    const cancelled = await this.sessions.update(session.id, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    } as never);

    if (session.graphEventId) {
      await queueService.enqueue('meeting.update', {
        sessionId: session.id,
        organizationId: actor.organizationId,
      });
    }

    await queueService.removeJob('session.reminder', `session-reminder-${session.id}`);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'session.cancelled',
      entityType: 'Session',
      entityId: cancelled.id,
    });

    return cancelled;
  }

  async getInvitation(sessionId: string) {
    await this.getById(sessionId);
    const invitation = await this.invitations.findBySession(sessionId);
    if (!invitation) {
      throw new NotFoundError('No invitation exists for this session yet');
    }
    return invitation;
  }

  /** `IV-02` resend — same Graph meeting, a fresh `sentAt` timestamp; the meeting invite itself lives on the Graph side, so this re-notifies without minting a new `joinToken` (`IV-04` — a token is never reissued outside a reschedule). */
  async resendInvitation(actor: ActingUser, sessionId: string) {
    const invitation = await this.getInvitation(sessionId);

    const updated = await this.invitations.update(invitation.id, {
      sentAt: new Date(),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'invitation.resent',
      entityType: 'Invitation',
      entityId: updated.id,
    });

    return updated;
  }

  /** Ownership resolution for `requireTeamAccess` — a session's manager is its learner's team manager. */
  async resolveManagerId(sessionId: string): Promise<string | null> {
    const session = await this.sessions.findByIdScoped(sessionId);
    if (!session) return null;
    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner) return null;
    const team = await teamRepository.findByIdScoped(learner.teamId);
    return team?.managerId ?? null;
  }
}
