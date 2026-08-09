import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
import { logger } from '@/logger/logger.service.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';

import type { QueuePayloads } from '../queues.js';

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
      await graphMeetingsService.cancelMeeting(plan.createdById, session.graphEventId);
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

    await graphMeetingsService.updateMeeting(plan.createdById, session.graphEventId, {
      startDateTime: session.scheduledStart.toISOString(),
      endDateTime: session.scheduledEnd.toISOString(),
    });

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
