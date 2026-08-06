import { Worker } from 'bullmq';

import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import { createQueueConnection } from './queue.service.js';
import { QUEUE_NAMES } from './queues.js';

const connection = createQueueConnection();

/**
 * One `Worker` per queue, all sharing a connection. No job processors exist
 * yet — every queue currently resolves with a no-op — real processors
 * arrive with the phases that need them (media scan in P5, meeting create
 * in P7, etc.). Concurrency/backoff/retries per ARCHITECTURE §10 are real,
 * not placeholders, so a phase adding a real processor doesn't have to
 * revisit this file's policy.
 */
const workers = QUEUE_NAMES.map(
  (name) =>
    new Worker(
      name,
      async (job) => {
        logger.info({ queue: name, jobId: job.id }, 'No-op processor — no handler registered yet');
      },
      { connection, concurrency: 5 },
    ),
);

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
