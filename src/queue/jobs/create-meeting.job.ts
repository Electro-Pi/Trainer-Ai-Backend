import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
import { GraphMeetingCreatedWithoutJoinUrlError } from '@/integrations/microsoft/graph.service.js';
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
import { portalUserRepository } from '@/modules/users/users.module.js';
import type { EmailService } from '@/shared-types.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();
const REMINDER_LEAD_TIME_MS = 60 * 60_000;
const AGENT_DISPATCH_LEAD_TIME_MS = 3 * 60_000;

/**
 * `IV-01`, `IV-05` — creates the Teams meeting for a confirmed session,
 * restricted-lobby and agent-as-presenter (§7.5), then records the invite.
 * Idempotent by `jobId: meeting-create-<sessionId>` (enqueued in
 * `TrainingPlanService.confirm`) — retrying this job for the same session on
 * a queue retry never double-books, since it's keyed at the queue level, not
 * here.
 */
export async function processCreateMeetingJob(
  payload: QueuePayloads['meeting.create'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session) {
      logger.warn({ sessionId: payload.sessionId }, 'create-meeting: session not found, skipping');
      return;
    }

    // A prior attempt can have left `graphEventId` set with no `joinUrl` —
    // `GraphMeetingCreatedWithoutJoinUrlError`'s recovery path below records
    // the event id precisely so this retry doesn't call `POST /me/events`
    // again and create a second calendar invite. Only a session that
    // actually finished (has both) is truly done.
    if (session.graphEventId && session.joinUrl) {
      logger.info(
        { sessionId: session.id },
        'create-meeting: session already has a meeting, skipping',
      );
      return;
    }

    const plan = await trainingPlanRepository.findByIdScoped(session.planId);
    const learner = await learnerRepository.findByIdScoped(session.learnerId);

    if (!plan || !learner) {
      logger.error(
        { sessionId: session.id, planId: session.planId, learnerId: session.learnerId },
        'create-meeting: plan or learner missing, notifying manager rather than a silent no-show',
      );
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_creation_failed',
        entityType: 'Session',
        entityId: session.id,
        after: { reason: 'plan_or_learner_not_found' },
      });
      return;
    }

    // `resolveAccessToken` (graph.meetings.ts) throws "No Microsoft Graph
    // session for this user" when the plan's creator never connected their
    // Microsoft account — a permanent auth gap, not a transient Graph
    // failure. Left unchecked, pg-boss burns 4 retries against something
    // that will never succeed on its own, and the only trace is a buried
    // job-failure record — the manager never learns why no meeting/email
    // ever went out. Checking it up front fails fast with the same
    // "notify, don't silently retry forever" pattern as the plan/learner
    // check above.
    const organizer = await portalUserRepository.findByIdUnscoped(plan.createdById);
    if (!organizer?.graphHomeAccountId || !organizer.graphTokenCacheEncrypted) {
      logger.error(
        { sessionId: session.id, organizerId: plan.createdById },
        'create-meeting: plan creator has no Microsoft Graph session — notifying manager rather than retrying forever',
      );
      await writeAuditLog({
        organizationId: payload.organizationId,
        actorType: 'SYSTEM',
        action: 'session.meeting_creation_failed',
        entityType: 'Session',
        entityId: session.id,
        after: { reason: 'organizer_not_connected_to_microsoft', organizerId: plan.createdById },
      });
      return;
    }

    // A prior attempt can have left `graphEventId` set with no `joinUrl` —
    // recover by re-checking that same event instead of calling
    // `createMeeting` again, which would create a second calendar invite.
    let meeting: { id: string; joinWebUrl: string };
    if (session.graphEventId) {
      const joinUrl = await graphMeetingsService.getMeetingJoinUrl(
        plan.createdById,
        session.graphEventId,
      );
      if (!joinUrl) {
        throw new GraphMeetingCreatedWithoutJoinUrlError(session.graphEventId);
      }
      meeting = { id: session.graphEventId, joinWebUrl: joinUrl };
    } else {
      try {
        meeting = await graphMeetingsService.createMeeting(plan.createdById, {
          subject: `Training session — ${learner.displayName}`,
          startDateTime: session.scheduledStart.toISOString(),
          endDateTime: session.scheduledEnd.toISOString(),
          attendeeEmails: [learner.email],
        });
      } catch (error) {
        if (error instanceof GraphMeetingCreatedWithoutJoinUrlError) {
          await sessions.recordGraphEventOnly(session.id, error.eventId);
        }
        throw error;
      }
    }

    const updated = await sessions.recordMeetingCreated(session.id, session.learnerId, {
      graphEventId: meeting.id,
      joinUrl: meeting.joinWebUrl,
    });

    const joinUrlForNotifications = updated.joinUrl ?? meeting.joinWebUrl;

    // `TrainingPlanService.confirm()` sends one combined overview email the
    // moment the manager confirms, but that fires before any of these
    // `meeting.create` jobs run — no Teams meeting exists yet at that point,
    // so that email can't carry a join link (see its own comment). This is
    // the per-session follow-up once the meeting is real: same branded
    // template as the reschedule email, with the actual "Join meeting" link.
    // Best-effort — a delivery failure here shouldn't fail meeting creation,
    // which already succeeded on Graph regardless.
    try {
      const outcome = await outcomeRepository.findByIdScoped(session.primaryOutcomeId);
      const skill = outcome?.skillId ? await skillRepository.findByIdScoped(outcome.skillId) : null;
      const organization = await organizationRepository.findById(payload.organizationId);
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
          durationMinutes: session.durationMinutes ?? 45,
          joinUrl: joinUrlForNotifications,
          language,
          kind: 'confirmed',
        }),
      });
    } catch (error) {
      logger.error(
        { sessionId: session.id, err: error },
        'create-meeting: session confirmation email failed to send',
      );
    }

    // `P8-10`, ARCHITECTURE §9.11 rule 6 — asks the AI Trainer service to join
    // the meeting via the same `POST /sessions/external` call the manual
    // `ExternalSessionService.start()` flow uses. Scheduled for close to the
    // session's real start time (`agent.dispatch`, `AGENT_DISPATCH_LEAD_TIME_MS`
    // before `scheduledStart`) rather than fired here at confirm-time — the
    // AI Trainer's start call has no scheduled-time field, it's "join this
    // meeting_url right now," so dispatching it at confirm-time (which can be
    // hours or days before the actual session) has the agent show up and time
    // out long before the learner does. Also re-enqueued by
    // `meeting-update.job.ts` on reschedule — see `dispatch-ai-trainer.ts`'s
    // own doc comment for why a reschedule needs a fresh dispatch too.
    const dispatchDelayMs =
      session.scheduledStart.getTime() - AGENT_DISPATCH_LEAD_TIME_MS - Date.now();
    await queueService.enqueue(
      'agent.dispatch',
      { sessionId: session.id, organizationId: payload.organizationId },
      {
        jobId: `agent-dispatch-${session.id}`,
        ...(dispatchDelayMs > 0 ? { delayMs: dispatchDelayMs } : {}),
      },
    );

    const reminderDelayMs = session.scheduledStart.getTime() - REMINDER_LEAD_TIME_MS - Date.now();
    if (reminderDelayMs > 0) {
      await queueService.enqueue(
        'session.reminder',
        { sessionId: session.id, organizationId: payload.organizationId },
        { jobId: `session-reminder-${session.id}`, delayMs: reminderDelayMs },
      );
    }

    await writeAuditLog({
      organizationId: payload.organizationId,
      actorType: 'SYSTEM',
      action: 'session.meeting_created',
      entityType: 'Session',
      entityId: session.id,
      after: { graphEventId: meeting.id },
    });

    logger.info({ sessionId: session.id, graphEventId: meeting.id }, 'Meeting created');
  });
}
