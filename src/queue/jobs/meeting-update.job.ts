import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { graphMeetingsService } from '@/integrations/microsoft/graph.meetings.js';
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

    // Branded "your session moved" email — the calendar-event PATCH above
    // already makes Outlook send its own native update notification, this
    // is the second, MODRB-styled email confirming the new time, matching
    // the one sent when the meeting was first created. Best-effort: a
    // delivery failure is logged, not thrown — the meeting update is
    // already real on Graph either way.
    try {
      const learner = await learnerRepository.findByIdScoped(session.learnerId);
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
