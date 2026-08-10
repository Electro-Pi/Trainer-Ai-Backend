/* eslint-disable import-x/order -- env must import first so boot fails
   loudly on a bad/missing var before app assembly or Prisma run; that
   ordering is deliberately not alphabetical. */
import { env } from '@/config/env.js';

import { createApp } from '@/app.js';
import { disconnectPrisma } from '@/database/prisma.service.js';
import { logger } from '@/logger/logger.service.js';
import { closeQueueService } from '@/queue/queue-instance.js';
/* eslint-enable import-x/order */

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
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
