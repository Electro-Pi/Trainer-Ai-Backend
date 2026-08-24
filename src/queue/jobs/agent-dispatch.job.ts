import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { SessionRepository } from '@/modules/sessions/repositories/session.repository.js';

import type { QueuePayloads } from '../queues.js';

import { dispatchToAiTrainer } from './dispatch-ai-trainer.js';

const sessions = new SessionRepository();

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

/**
 * Fires close to `session.scheduledStart` (enqueued with a delay by
 * `create-meeting.job.ts` and re-enqueued by `meeting-update.job.ts` on
 * reschedule) rather than at plan-confirm time — the AI Trainer's
 * `POST /sessions/external` has no scheduled-time field, it's a "join this
 * meeting_url right now" call, so dispatching it hours or days before the
 * real start just has the agent show up (and time out) long before anyone
 * else does. Re-reads the session fresh rather than trusting whatever state
 * it was in when this job was enqueued — it may have been rescheduled again
 * or cancelled in the meantime.
 */
export async function processAgentDispatchJob(
  payload: QueuePayloads['agent.dispatch'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const session = await sessions.findByIdScoped(payload.sessionId);
    if (!session) {
      logger.warn({ sessionId: payload.sessionId }, 'agent-dispatch: session not found, skipping');
      return;
    }
    if (TERMINAL_STATUSES.has(session.status)) {
      logger.info(
        { sessionId: session.id, status: session.status },
        'agent-dispatch: session no longer active, skipping',
      );
      return;
    }
    if (!session.joinUrl) {
      logger.warn(
        { sessionId: session.id },
        'agent-dispatch: session has no meeting join URL, skipping',
      );
      return;
    }

    const learner = await learnerRepository.findByIdScoped(session.learnerId);
    if (!learner) {
      logger.error({ sessionId: session.id }, 'agent-dispatch: learner not found, skipping');
      return;
    }

    await dispatchToAiTrainer({
      organizationId: payload.organizationId,
      session,
      learner,
      joinUrl: session.joinUrl,
    });
  });
}
