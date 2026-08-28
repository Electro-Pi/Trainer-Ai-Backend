import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import {
  aiTrainerClientService,
  externalSessionRepository,
} from '@/modules/ai-trainer/ai-trainer.module.js';
import type { WebhookTranscriptTurn } from '@/modules/ai-trainer/ai-trainer.module.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { formatLocalDateAndTime } from '@/modules/notifications/format-local-time.js';
import {
  writeNotification,
  type WriteNotificationEntry,
} from '@/modules/notifications/notifications.module.js';
import {
  renderSessionConfirmationEmailHtml,
  sessionConfirmationEmailSubject,
} from '@/modules/notifications/templates/session-confirmation-email.template.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { skillRepository } from '@/modules/skills/skills.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { queueService } from '@/queue/queue-instance.js';
import type { EmailService } from '@/shared-types.js';

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

  /**
   * Notifies the session's assigned learner's team manager — not the
   * plan's `createdById`, to avoid a cross-module import back into
   * `training-plans` (which already imports `SessionService`, and a
   * `sessions -> training-plans` import back would create a module cycle).
   */
  private async notifySessionManager(
    organizationId: string,
    session: Session,
    entry: Omit<WriteNotificationEntry, 'organizationId' | 'recipientPortalUserId'>,
  ): Promise<void> {
    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner?.teamId) return;
    const team = await teamRepository.findByIdScoped(learner.teamId);
    if (!team?.managerId) return;
    await writeNotification({ organizationId, recipientPortalUserId: team.managerId, ...entry });
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

    // `silent` (the plan wizard's own per-pick calls, before or during a
    // re-edit of an already-confirmed plan) skips notifying entirely,
    // regardless of the parent plan's current status — status alone can't be
    // trusted here: editing an existing plan re-runs `suggest()`, which
    // drops it back to DRAFT, but a session picked over the following few
    // steps can still race a confirm from another tab, or the manager can be
    // editing a plan that's genuinely still CONFIRMED at the moment a
    // picker fires. Every other caller (Sessions/Calendar screens
    // rescheduling a live session) omits `silent` and keeps notifying as
    // before.
    if (!dto.silent) {
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

    if (!dto.silent) {
      const { date, time } = formatLocalDateAndTime(scheduledStart);
      await this.notifySessionManager(actor.organizationId, updated, {
        type: 'SESSION_RESCHEDULED',
        entityType: 'Session',
        entityId: session.id,
        titleEn: 'Session rescheduled',
        titleAr: 'تم تغيير موعد الجلسة',
        bodyEn: `New time: ${date} ${time}`,
        bodyAr: `الموعد الجديد: ${date} ${time}`,
      });
    }

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
    await queueService.removeJob('agent.dispatch', `agent-dispatch-${session.id}`);
    await queueService.removeJob(
      'session.confirmationEmail',
      `session-confirmation-email-${session.id}`,
    );

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'session.cancelled',
      entityType: 'Session',
      entityId: cancelled.id,
    });

    await this.notifySessionManager(actor.organizationId, cancelled, {
      type: 'SESSION_CANCELLED',
      entityType: 'Session',
      entityId: cancelled.id,
      titleEn: 'Session cancelled',
      titleAr: 'تم إلغاء الجلسة',
    });

    return cancelled;
  }

  /**
   * Resolves this session's `externalSessionId` (stamped by
   * `create-meeting.job.ts` when it dispatches to the AI Trainer service)
   * and proxies to its `GET /sessions/{id}/transcript` — the manager-facing
   * "view transcript" action on the Reports page. `Session.id` is what the
   * portal actually has; the AI Trainer only understands its own id, so this
   * indirection is required rather than exposing `/external-sessions/:id`
   * directly (which would leak that id and require the frontend to know it).
   */
  async getTranscript(sessionId: string) {
    const session = await this.getById(sessionId);
    if (!session.externalSessionId) {
      throw new NotFoundError('No transcript exists for this session yet');
    }

    // The webhook (`POST /external-sessions/:id/complete`) saves the
    // transcript once the meeting ends — prefer that over a live pull, which
    // only works while the AI Trainer's own session record is still
    // resolvable and is the sole source before the webhook fires.
    const externalSession = await externalSessionRepository.findByIdScoped(
      session.externalSessionId,
    );
    if (externalSession?.transcriptPayload) {
      const stored = externalSession.transcriptPayload as unknown as {
        turns: WebhookTranscriptTurn[];
      };
      return {
        sessionId: session.id,
        status: 'completed',
        turns: stored.turns.map((turn) => ({
          turnIndex: turn.turn_index,
          speaker: turn.speaker,
          text: turn.text,
          occurredAt: turn.occurred_at,
        })),
      };
    }

    const transcript = await aiTrainerClientService.getSessionTranscript(session.externalSessionId);
    return {
      sessionId: session.id,
      status: transcript.status,
      turns: transcript.turns.map((turn) => ({
        turnIndex: turn.turn_index,
        speaker: turn.speaker,
        text: turn.text,
        occurredAt: turn.occurred_at,
      })),
    };
  }

  async getInvitation(sessionId: string) {
    await this.getById(sessionId);
    const invitation = await this.invitations.findBySession(sessionId);
    if (!invitation) {
      throw new NotFoundError('No invitation exists for this session yet');
    }
    return invitation;
  }

  /**
   * `IV-02` resend — same Graph meeting, a fresh `sentAt` timestamp; the
   * meeting invite itself lives on the Graph side, so this re-notifies
   * without minting a new `joinToken` (`IV-04` — a token is never reissued
   * outside a reschedule). Sends the branded confirmation email inline
   * (not via the job queue) — unlike the create/reschedule paths, this is a
   * manager clicking "Resend" and expecting it to happen now, not whenever a
   * background worker gets to it. A delivery failure throws (surfaced to the
   * manager as a real failure), since silently updating `sentAt` while no
   * email actually went out is exactly the bug this replaces.
   */
  async resendInvitation(actor: ActingUser, sessionId: string) {
    const invitation = await this.getInvitation(sessionId);
    const session = await this.getById(sessionId);

    if (!session.joinUrl) {
      throw new ConflictError('This session has no meeting to resend an invitation for yet');
    }

    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner) {
      throw new NotFoundError('Learner not found');
    }
    const outcome = await outcomeRepository.findByIdScoped(session.primaryOutcomeId);
    const skill = outcome?.skillId ? await skillRepository.findByIdScoped(outcome.skillId) : null;
    const organization = await organizationRepository.findById(actor.organizationId);
    const language = organization?.defaultLanguage === 'AR' ? 'AR' : 'EN';

    const emailService = container.resolveEmail<EmailService>();
    await emailService.send({
      to: learner.email,
      subject: sessionConfirmationEmailSubject(skill?.nameEn ?? 'your session', language),
      html: renderSessionConfirmationEmailHtml({
        learnerName: learner.displayName,
        skillName: skill?.nameEn ?? 'Training session',
        outcomeTitle: outcome?.titleEn ?? '',
        ...formatLocalDateAndTime(session.scheduledStart),
        joinUrl: session.joinUrl,
        language,
      }),
    });

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
