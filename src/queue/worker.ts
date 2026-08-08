import { Job, Worker } from 'bullmq';

import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import { processEmbedContentJob } from './jobs/embed-content.job.js';
import { processExtractTextJob } from './jobs/extract-text.job.js';
import { processScanMediaJob } from './jobs/scan-media.job.js';
import { createQueueConnection } from './queue.service.js';
import { QUEUE_NAMES, type QueueName, type QueuePayloads } from './queues.js';

const connection = createQueueConnection();

type Processor<K extends QueueName> = (payload: QueuePayloads[K]) => Promise<void>;

/**
 * Real processors, one per queue that a shipped phase owns. Queues without
 * an entry here fall through to the no-op default — real processors arrive
 * with the phase that needs them (meeting create in P7, report generate in
 * P9, etc.), per this file's original P0 comment.
 */
const PROCESSORS: Partial<{ [K in QueueName]: Processor<K> }> = {
  'media.scan': processScanMediaJob,
  'media.extract': processExtractTextJob,
  'content.embed': processEmbedContentJob,
};

const workers = QUEUE_NAMES.map((name) => {
  const processor = PROCESSORS[name];
  return new Worker(
    name,
    async (job: Job) => {
      if (!processor) {
        logger.info({ queue: name, jobId: job.id }, 'No-op processor — no handler registered yet');
        return;
      }
      await processor(job.data as never);
    },
    { connection, concurrency: 5 },
  );
});

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    logger.error({ queue: worker.name, jobId: job?.id, err }, 'Job failed');
  });
}

logger.info({ queues: QUEUE_NAMES, env: env.NODE_ENV }, 'Worker process started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
