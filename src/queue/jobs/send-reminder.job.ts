import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { InvitationRepository } from '@/modules/sessions/repositories/invitation.repository.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';

import type { QueuePayloads } from '../queues.js';

const sessions = new SessionRepository();
const invitations = new InvitationRepository();

/**
 * `IV-07` — delayed `scheduledStart - 60m` (enqueued with that delay when the
 * job is scheduled — this processor just records the reminder, actual
 * delivery is `notifications`' job, P9). Skips a session that was rescheduled
 * or cancelled after this job was queued, since the delay could be long.
 */
export async function processSendReminderJob(
  payload: QueuePayloads['session.reminder'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session || session.status === 'CANCELLED') {
      logger.info(
        { sessionId: payload.sessionId },
        'send-reminder: session cancelled or missing, skipping',
      );
      return;
    }

    const invitation = await invitations.findBySession(session.id);
    if (!invitation) {
      logger.warn({ sessionId: session.id }, 'send-reminder: no invitation to remind, skipping');
      return;
    }

    await invitations.update(invitation.id, { reminderSentAt: new Date() } as never);

    await writeAuditLog({
      organizationId: payload.organizationId,
      actorType: 'SYSTEM',
      action: 'invitation.reminder_sent',
      entityType: 'Invitation',
      entityId: invitation.id,
    });

    logger.info({ sessionId: session.id }, 'Reminder recorded');
  });
}
