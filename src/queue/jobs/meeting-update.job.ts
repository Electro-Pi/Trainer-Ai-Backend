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

import type { QueuePayloads } from '../queues.js';

import { dispatchToAiTrainer } from './dispatch-ai-trainer.js';

const sessions = new SessionRepository();

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
    if (!session?.graphEventId) {
      logger.warn(
        { sessionId: payload.sessionId },
        'meeting-update: session or meeting not found, skipping',
      );
      return;
    }

    const plan = await trainingPlanRepository.findByIdScoped(session.planId);
    if (!plan) {
      logger.error({ sessionId: session.id }, 'meeting-update: plan not found, skipping');
      return;
    }

    if (session.status === 'CANCELLED') {
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

    try {
      await graphMeetingsService.updateMeeting(plan.createdById, session.graphEventId, {
        startDateTime: session.scheduledStart.toISOString(),
        endDateTime: session.scheduledEnd.toISOString(),
      });
    } catch (error) {
      if (!(error instanceof GraphEventNotFoundError)) throw error;

      // The event this session's `graphEventId` pointed at was deleted
      // directly in Outlook (not through this app) — updating it is
      // impossible, but the session still needs a real meeting at its new
      // time. Recreate it exactly like `create-meeting.job.ts` does for a
      // session with no meeting yet, then persist the fresh id/joinUrl so
      // this session isn't left pointing at a dead reference again.
      if (!learner) {
        logger.error(
          { sessionId: session.id },
          'meeting-update: event gone and learner not found, cannot recreate',
        );
        throw error;
      }
      logger.warn(
        { sessionId: session.id, staleGraphEventId: session.graphEventId },
        'meeting-update: event was deleted, recreating meeting at the new time',
      );
      const recreated = await graphMeetingsService.createMeeting(plan.createdById, {
        subject: `Training session — ${learner.displayName}`,
        startDateTime: session.scheduledStart.toISOString(),
        endDateTime: session.scheduledEnd.toISOString(),
        attendeeEmails: [learner.email],
      });
      await sessions.recordMeetingCreated(session.id, session.learnerId, {
        graphEventId: recreated.id,
        joinUrl: recreated.joinWebUrl,
      });
      session.graphEventId = recreated.id;
      session.joinUrl = recreated.joinWebUrl;
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_recreated',
        entityType: 'Session',
        entityId: session.id,
        after: { graphEventId: recreated.id },
      });
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
            durationMinutes: session.durationMinutes ?? 45,
            joinUrl: session.joinUrl ?? '',
            language,
            kind: 'rescheduled',
          }),
        });
      }
    } catch (error) {
      logger.error(
        { sessionId: session.id, err: error },
        'meeting-update: reschedule email failed to send',
      );
    }

    // Re-dispatch the AI Trainer to the (possibly new) join link/time — a
    // session already dispatched once was only ever told about its
    // *original* meeting; without this, a reschedule silently leaves the
    // agent working from a stale reference it can never learn has changed
    // (see `dispatch-ai-trainer.ts`'s doc comment). Always re-dispatches on
    // a successful reschedule, even if the Graph event itself was merely
    // updated in place (same event id, new time) — the AI Trainer has no
    // "update" endpoint, only "start a new session".
    if (learner) {
      await dispatchToAiTrainer({
        organizationId: payload.organizationId,
        session,
        learner,
        joinUrl: session.joinUrl ?? '',
      });
    }

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
