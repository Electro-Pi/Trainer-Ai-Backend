import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
import { logger } from '@/logger/logger.service.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();
const REMINDER_LEAD_TIME_MS = 60 * 60_000;

/**
 * `IV-01`, `IV-05` — creates the Teams meeting for a confirmed session,
 * restricted-lobby and agent-as-presenter (§7.5), then records the invite.
 * Idempotent by `jobId: meeting-create-<sessionId>` (enqueued in
 * `TrainingPlanService.confirm`) — retrying this job for the same session on
 * BullMQ retry never double-books, since it's keyed at the queue level, not
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

    if (session.graphEventId) {
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

    const meeting = await graphMeetingsService.createMeeting(plan.createdById, {
      subject: `Training session — ${learner.displayName}`,
      startDateTime: session.scheduledStart.toISOString(),
      endDateTime: session.scheduledEnd.toISOString(),
      attendeeEmails: [learner.email],
    });

    await sessions.recordMeetingCreated(session.id, session.learnerId, {
      graphEventId: meeting.id,
      joinUrl: meeting.joinWebUrl,
    });

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
