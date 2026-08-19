import type { Job } from 'pg-boss';

import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import { processCleanupJob } from './jobs/cleanup.job.js';
import { processCreateMeetingJob } from './jobs/create-meeting.job.js';
import { processGenerateReportJob } from './jobs/generate-report.job.js';
import { processHealthAlertJob } from './jobs/health-alert.job.js';
import { processMeetingUpdateJob } from './jobs/meeting-update.job.js';
import { processRecomputeEffectivenessJob } from './jobs/recompute-effectiveness.job.js';
import { processScanMediaJob } from './jobs/scan-media.job.js';
import { processSendInviteJob } from './jobs/send-invite.job.js';
import { processSendReminderJob } from './jobs/send-reminder.job.js';
import { processSendReportJob } from './jobs/send-report.job.js';
import { createQueueConnection, createQueueService } from './queue.service.js';
import { QUEUE_NAMES, type QueueName, type QueuePayloads } from './queues.js';

const connection = createQueueConnection();
const queueService = createQueueService(connection);

type Processor<K extends QueueName> = (payload: QueuePayloads[K]) => Promise<void>;

/**
 * Real processors, one per queue that a shipped phase owns. Queues without
 * an entry here fall through to the no-op default — real processors arrive
 * with the phase that needs them (meeting create in P7, report generate in
 * P9, etc.), per this file's original P0 comment.
 */
const PROCESSORS: Partial<{ [K in QueueName]: Processor<K> }> = {
  'media.scan': processScanMediaJob,
  'meeting.create': processCreateMeetingJob,
  'meeting.update': processMeetingUpdateJob,
  'session.reminder': processSendReminderJob,
  'report.generate': processGenerateReportJob,
  'report.send': processSendReportJob,
  'effectiveness.recompute': processRecomputeEffectivenessJob,
  cleanup: processCleanupJob,
  'health.alert': processHealthAlertJob,
  'invite.send': processSendInviteJob,
};

async function main(): Promise<void> {
  await queueService.ensureAllQueues();

  for (const name of QUEUE_NAMES) {
    const processor = PROCESSORS[name];
    await connection.work(name, { localConcurrency: 5 }, async ([job]: Job[]) => {
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
  // name, so re-running this on every worker boot updates the pattern in
  // place rather than accumulating duplicate schedules.
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

  logger.info({ queues: QUEUE_NAMES, env: env.NODE_ENV }, 'Worker process started');
}

void main().catch((err: unknown) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  await connection.stop();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
