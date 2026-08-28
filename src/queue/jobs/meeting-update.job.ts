import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
import { GraphEventNotFoundError } from '@/integrations/microsoft/graph.service.js';
import { logger } from '@/logger/logger.service.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { formatLocalDateAndTime } from '@/modules/notifications/format-local-time.js';
import {
  renderSessionConfirmationEmailHtml,
  sessionConfirmationEmailSubject,
} from '@/modules/notifications/templates/session-confirmation-email.template.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';
import { skillRepository } from '@/modules/skills/skills.module.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';
import type { EmailService } from '@/shared-types.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();
const AGENT_DISPATCH_LEAD_TIME_MS = 3 * 60_000;

/**
 * `TP-06` — reschedule/cancel already wrote the session's new state before
 * enqueuing this job; the job reads that state back and reflects it onto the
 * real Teams meeting (update the time window, or cancel it if the session is
 * now `CANCELLED`) — one job type driven by DB state rather than a payload
 * flag, matching the read-current-state style of every other job here.
 */
export async function processMeetingUpdateJob(
  payload: QueuePayloads['meeting.update'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session) {
      logger.warn({ sessionId: payload.sessionId }, 'meeting-update: session not found, skipping');
      return;
    }

    const plan = await trainingPlanRepository.findByIdScoped(session.planId);
    if (!plan) {
      logger.error({ sessionId: session.id }, 'meeting-update: plan not found, skipping');
      return;
    }

    if (session.status === 'CANCELLED') {
      if (!session.graphEventId) {
        logger.info(
          { sessionId: session.id },
          'meeting-update: session cancelled with no meeting to cancel, skipping',
        );
        return;
      }
      try {
        await graphMeetingsService.cancelMeeting(plan.createdById, session.graphEventId);
      } catch (error) {
        // Already gone (deleted directly in Outlook) — nothing left to
        // cancel, which is the outcome we wanted anyway. Only a real
        // transient Graph failure should still fail this job.
        if (!(error instanceof GraphEventNotFoundError)) throw error;
        logger.info(
          { sessionId: session.id },
          'meeting-update: event already gone, treating cancel as satisfied',
        );
      }
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_cancelled',
        entityType: 'Session',
        entityId: session.id,
      });
      logger.info({ sessionId: session.id }, 'Meeting cancelled');
      return;
    }

    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    const planCreatedById = plan.createdById;
    const sessionId = session.id;
    const sessionLearnerId = session.learnerId;
    const scheduledStart = session.scheduledStart;
    const scheduledEnd = session.scheduledEnd;

    /**
     * Recreates the Teams meeting from scratch at the session's (new)
     * scheduled time — shared by the "never had a meeting yet" case (plan
     * was still DRAFT at the time of an earlier reschedule, so
     * `meeting.create` never ran) and the "event was deleted directly in
     * Outlook" case below. Same call shape as `create-meeting.job.ts`.
     */
    async function recreateMeeting(): Promise<{ joinUrl: string }> {
      if (!learner) {
        logger.error(
          { sessionId },
          'meeting-update: no meeting exists and learner not found, cannot create one',
        );
        throw new Error(`meeting-update: learner not found for session ${sessionId}`);
      }
      const recreated = await graphMeetingsService.createMeeting(planCreatedById, {
        subject: `Training session — ${learner.displayName}`,
        startDateTime: scheduledStart.toISOString(),
        endDateTime: scheduledEnd.toISOString(),
        attendeeEmails: [learner.email],
      });
      await sessions.recordMeetingCreated(sessionId, sessionLearnerId, {
        graphEventId: recreated.id,
        joinUrl: recreated.joinWebUrl,
      });
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_recreated',
        entityType: 'Session',
        entityId: sessionId,
        after: { graphEventId: recreated.id },
      });
      return { joinUrl: recreated.joinWebUrl };
    }

    const originalGraphEventId = session.graphEventId;
    let currentJoinUrl = session.joinUrl;

    if (!originalGraphEventId) {
      logger.info(
        { sessionId },
        'meeting-update: session had no meeting yet, creating one at the new time',
      );
      ({ joinUrl: currentJoinUrl } = await recreateMeeting());
    } else {
      try {
        await graphMeetingsService.updateMeeting(planCreatedById, originalGraphEventId, {
          startDateTime: scheduledStart.toISOString(),
          endDateTime: scheduledEnd.toISOString(),
        });
      } catch (error) {
        if (!(error instanceof GraphEventNotFoundError)) throw error;

        // The event this session's `graphEventId` pointed at was deleted
        // directly in Outlook (not through this app) — updating it is
        // impossible, but the session still needs a real meeting at its new
        // time.
        logger.warn(
          { sessionId, staleGraphEventId: originalGraphEventId },
          'meeting-update: event was deleted, recreating meeting at the new time',
        );
        ({ joinUrl: currentJoinUrl } = await recreateMeeting());
      }
    }

    // Branded "your session moved" email — the calendar-event PATCH above
    // already makes Outlook send its own native update notification, this
    // is the second, MODRB-styled email confirming the new time, matching
    // the one sent when the meeting was first created. Best-effort: a
    // delivery failure is logged, not thrown — the meeting update is
    // already real on Graph either way.
    try {
      const outcome = await outcomeRepository.findByIdScoped(session.primaryOutcomeId);
      const skill = outcome?.skillId ? await skillRepository.findByIdScoped(outcome.skillId) : null;
      const organization = await organizationRepository.findById(payload.organizationId);
      const language = organization?.defaultLanguage === 'AR' ? 'AR' : 'EN';

      if (learner) {
        const emailService = container.resolveEmail<EmailService>();
        await emailService.send({
          to: learner.email,
          subject: sessionConfirmationEmailSubject(
            skill?.nameEn ?? 'your session',
            language,
            'rescheduled',
          ),
          html: renderSessionConfirmationEmailHtml({
            learnerName: learner.displayName,
            skillName: skill?.nameEn ?? 'Training session',
            outcomeTitle: outcome?.titleEn ?? '',
            ...formatLocalDateAndTime(session.scheduledStart),
            joinUrl: currentJoinUrl ?? '',
            language,
            kind: 'rescheduled',
          }),
        });
      }
    } catch (error) {
      logger.error({ sessionId, err: error }, 'meeting-update: reschedule email failed to send');
    }

    // Re-schedule the AI Trainer dispatch for the (possibly new) time/join
    // link — a session already dispatched once was only ever told about its
    // *original* meeting; without this, a reschedule silently leaves the
    // agent working from a stale reference it can never learn has changed
    // (see `dispatch-ai-trainer.ts`'s doc comment). Cancels any dispatch job
    // still pending for the old time first — `agent.dispatch`'s `jobId` is
    // keyed by session id, and pg-boss silently drops a second `send` under
    // an already-pending key rather than replacing it (same reason
    // `session.reminder` below cancels before re-enqueuing). Always
    // re-schedules on a successful reschedule, even if the Graph event
    // itself was merely updated in place (same event id, new time) — the AI
    // Trainer has no "update" endpoint, only "start a new session".
    if (learner) {
      await queueService.removeJob('agent.dispatch', `agent-dispatch-${session.id}`);
      const dispatchDelayMs = scheduledStart.getTime() - AGENT_DISPATCH_LEAD_TIME_MS - Date.now();
      await queueService.enqueue(
        'agent.dispatch',
        { sessionId: session.id, organizationId: payload.organizationId },
        {
          jobId: `agent-dispatch-${session.id}`,
          ...(dispatchDelayMs > 0 ? { delayMs: dispatchDelayMs } : {}),
        },
      );
    }

    // The delayed `session.confirmationEmail` job scheduled at the original
    // confirm time is now stale — cancel it. The "session moved" email just
    // sent above already covers the join link for the new time; there's no
    // separate near-start confirmation to reschedule here (reschedules don't
    // re-run `create-meeting.job.ts`).
    await queueService.removeJob(
      'session.confirmationEmail',
      `session-confirmation-email-${session.id}`,
    );

    await writeAuditLog({
      organizationId: payload.organizationId,
      actorType: 'SYSTEM',
      action: 'session.meeting_updated',
      entityType: 'Session',
      entityId: session.id,
      after: { scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd },
    });

    logger.info({ sessionId: session.id }, 'Meeting updated');
  });
}
