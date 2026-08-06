import express, { type Express } from 'express';
import { Redis } from 'ioredis';

import { NotFoundError } from '@/common/exceptions/app-error.js';
import { errorHandler } from '@/common/filters/error-handler.js';
import { requestIdInterceptor } from '@/common/interceptors/request-id.interceptor.js';
import { compressionMiddleware } from '@/common/middleware/compression.middleware.js';
import { corsMiddleware } from '@/common/middleware/cors.middleware.js';
import { helmetMiddleware } from '@/common/middleware/helmet.middleware.js';
import { localeMiddleware } from '@/common/middleware/locale.middleware.js';
import { rateLimitMiddleware } from '@/common/middleware/rate-limit.middleware.js';
import { env } from '@/config/env.js';
import { prisma } from '@/database/prisma.service.js';
import { createHttpLogger, logger } from '@/logger/logger.service.js';
import { mountSwagger } from '@/swagger/swagger.js';

interface DependencyCheck {
  name: string;
  ok: boolean;
  error?: string;
}

async function checkDatabase(): Promise<DependencyCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'database', ok: true };
  } catch (error) {
    return {
      name: 'database',
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await client.connect();
    await client.ping();
    return { name: 'redis', ok: true };
  } catch (error) {
    return {
      name: 'redis',
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  } finally {
    client.disconnect();
  }
}

async function checkStorage(): Promise<DependencyCheck> {
  // Real check (Azure Blob ping) arrives with P5; the local dev provider has
  // nothing external to fail against, so it always reports healthy.
  if (env.STORAGE_PROVIDER === 'local') {
    return { name: 'storage', ok: true };
  }
  return { name: 'storage', ok: true };
}

/**
 * Express app assembly only — no `.listen()` here so the app stays
 * importable/testable (P11). Middleware order: request id → http logger →
 * locale → security/perf middleware → routes → swagger → error handler
 * (mounted LAST, per Express 5 error-middleware convention).
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestIdInterceptor());
  app.use(createHttpLogger());
  app.use(localeMiddleware());
  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(compressionMiddleware());
  app.use(rateLimitMiddleware());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const v1 = express.Router();
  app.use('/api/v1', v1);

  mountSwagger(app);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    const checks = await Promise.all([checkDatabase(), checkRedis(), checkStorage()]);
    const failed = checks.filter((check) => !check.ok);

    if (failed.length > 0) {
      res.status(503).json({ status: 'not_ready', checks });
      return;
    }

    res.status(200).json({ status: 'ready', checks });
  });

  app.use((req, _res, next) => {
    next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
  });

  app.use(errorHandler(logger));

  return app;
}
