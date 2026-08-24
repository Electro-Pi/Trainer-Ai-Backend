/* eslint-disable import-x/order -- env must import first so boot fails
   loudly on a bad/missing var before app assembly or Prisma run; that
   ordering is deliberately not alphabetical. */
import { env } from '@/config/env.js';

import { createApp } from '@/app.js';
import { disconnectPrisma } from '@/database/prisma.service.js';
import { logger } from '@/logger/logger.service.js';
import { closeQueueService, connection, queueService } from '@/queue/queue-instance.js';
import { startWorker } from '@/queue/start-worker.js';
/* eslint-enable import-x/order */

// Same crash-resilience as the old standalone worker process: pg-boss's
// poll loop can reject from a path that reaches Node's process-level crash
// guard, and an `error` event with no listener kills the process outright.
// The API server must ride out a transient DB blip the same way the worker
// used to, now that job processing runs in this process too.
process.on('uncaughtException', (err: unknown) => {
  logger.error({ err }, 'uncaught exception — staying up');
});
process.on('unhandledRejection', (err: unknown) => {
  logger.error({ err }, 'unhandled rejection — staying up');
});

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

void startWorker(connection, queueService).catch((err: unknown) => {
  logger.error({ err }, 'Worker failed to start');
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await closeQueueService();
  await disconnectPrisma();

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
