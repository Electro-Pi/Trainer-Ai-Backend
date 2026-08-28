import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
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
import type { EmailService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();

/**
 * Delayed `scheduledStart - 5m` (enqueued with that delay by `create-meeting.job.ts`
 * once the Teams meeting is real). Split out of that job so the join-link email
 * doesn't fire back-to-back with `TrainingPlanService.confirm()`'s own overview
 * email — the learner now gets the overview immediately at confirm time and this
 * one right before the session actually starts, instead of both within seconds
 * of each other. Skips a session that was rescheduled or cancelled after this
 * job was queued, since the delay can be long (mirrors `send-reminder.job.ts`).
 */
export async function processSendSessionConfirmationEmailJob(
  payload: QueuePayloads['session.confirmationEmail'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session || session.status === 'CANCELLED') {
      logger.info(
        { sessionId: payload.sessionId },
        'send-session-confirmation-email: session cancelled or missing, skipping',
      );
      return;
    }
    if (!session.joinUrl) {
      logger.warn(
        { sessionId: payload.sessionId },
        'send-session-confirmation-email: session has no join URL, skipping',
      );
      return;
    }

    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner) {
      logger.error(
        { sessionId: session.id },
        'send-session-confirmation-email: learner not found, skipping',
      );
      return;
    }

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
          joinUrl: session.joinUrl,
          language,
          kind: 'confirmed',
        }),
      });
    } catch (error) {
      logger.error(
        { sessionId: session.id, err: error },
        'send-session-confirmation-email: email failed to send',
      );
    }
  });
}
