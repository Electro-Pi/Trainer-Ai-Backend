import type { Job, PgBoss } from 'pg-boss';

import { logger } from '@/logger/logger.service.js';

import { processAgentDispatchJob } from './jobs/agent-dispatch.job.js';
import { processCleanupJob } from './jobs/cleanup.job.js';
import { processCreateMeetingJob } from './jobs/create-meeting.job.js';
import { processGenerateReportJob } from './jobs/generate-report.job.js';
import { processHealthAlertJob } from './jobs/health-alert.job.js';
import { processMeetingUpdateJob } from './jobs/meeting-update.job.js';
import { processRecomputeEffectivenessJob } from './jobs/recompute-effectiveness.job.js';
import { processReconcileExternalSessionsJob } from './jobs/reconcile-external-sessions.job.js';
import { processSendInviteJob } from './jobs/send-invite.job.js';
import { processSendReminderJob } from './jobs/send-reminder.job.js';
import { processSendReportJob } from './jobs/send-report.job.js';
import { processSendSessionConfirmationEmailJob } from './jobs/send-session-confirmation-email.job.js';
import type { QueueService } from './queue.service.js';
import { QUEUE_NAMES, type QueueName, type QueuePayloads } from './queues.js';

type Processor<K extends QueueName> = (payload: QueuePayloads[K]) => Promise<void>;

/**
 * Real processors, one per queue that a shipped phase owns. Queues without
 * an entry here fall through to the no-op default — real processors arrive
 * with the phase that needs them (meeting create in P7, report generate in
 * P9, etc.), per this file's original P0 comment.
 */
const PROCESSORS: Partial<{ [K in QueueName]: Processor<K> }> = {
  'meeting.create': processCreateMeetingJob,
  'meeting.update': processMeetingUpdateJob,
  'session.reminder': processSendReminderJob,
  'session.confirmationEmail': processSendSessionConfirmationEmailJob,
  'agent.dispatch': processAgentDispatchJob,
  'report.generate': processGenerateReportJob,
  'report.send': processSendReportJob,
  'effectiveness.recompute': processRecomputeEffectivenessJob,
  cleanup: processCleanupJob,
  'health.alert': processHealthAlertJob,
  'invite.send': processSendInviteJob,
  'external-session.reconcile': processReconcileExternalSessionsJob,
};

/**
 * Registers every job processor plus the nightly/periodic cron schedules on
 * the given pg-boss connection. Shared by `index.ts` (API process, since the
 * worker now runs in-process rather than as its own `worker.js` deployment)
 * — same processors, same cron patterns, same crash-resilience listeners as
 * the old standalone worker.
 */
export async function startWorker(connection: PgBoss, queueService: QueueService): Promise<void> {
  // pg-boss is a plain `EventEmitter` — Node's default behavior for an
  // `error` event with no listener is to throw and crash the whole process
  // (`ERR_UNHANDLED_ERROR`). A transient dropped DB connection ("Connection
  // terminated unexpectedly") is exactly the kind of blip a worker needs to
  // ride out, not die from — without this listener, one bad connection kills
  // every queue this process owns until something manually restarts it.
  connection.on('error', (err: unknown) => {
    logger.error({ err }, 'pg-boss connection error — worker staying up');
  });

  await queueService.ensureAllQueues();

  for (const name of QUEUE_NAMES) {
    const processor = PROCESSORS[name];
    // Was 5 — with the pool capped at QUEUE_POOL_MAX (5 total, shared across
    // every queue), 5-per-queue only caused internal contention against a
    // starved DB, not real throughput.
    await connection.work(name, { localConcurrency: 1 }, async ([job]: Job[]) => {
      if (!job) return;
      if (!processor) {
        logger.info({ queue: name, jobId: job.id }, 'No-op processor — no handler registered yet');
        return;
      }
      try {
        await processor(job.data as never);
      } catch (err) {
        logger.error({ queue: name, jobId: job.id, err }, 'Job failed');
        throw err;
      }
    });
  }

  // Nightly cron registration (§10.1, `RC-13`) — `schedule` upserts by queue
  // name, so re-running this on every boot updates the pattern in place
  // rather than accumulating duplicate schedules.
  await queueService
    .scheduleCron('effectiveness.recompute', {}, '0 2 * * *')
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to register effectiveness.recompute cron schedule');
    });

  await queueService.scheduleCron('cleanup', {}, '0 3 * * *').catch((err: unknown) => {
    logger.error({ err }, 'Failed to register cleanup cron schedule');
  });

  await queueService.scheduleCron('health.alert', {}, '*/5 * * * *').catch((err: unknown) => {
    logger.error({ err }, 'Failed to register health.alert cron schedule');
  });

  // Every 15 minutes rather than nightly: a lost webhook means the learner
  // and their manager are waiting on a report that will never arrive, and a
  // session the AI Trainer ended without an evaluation needs a human told
  // while the meeting is still fresh — neither can wait until 3am.
  await queueService
    .scheduleCron('external-session.reconcile', {}, '*/15 * * * *')
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to register external-session.reconcile cron schedule');
    });

  logger.info({ queues: QUEUE_NAMES }, 'Queue worker started');
}
