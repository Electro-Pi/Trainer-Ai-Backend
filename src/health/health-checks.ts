import { Redis } from 'ioredis';
import { UTApi } from 'uploadthing/server';

import { env } from '@/config/env.js';
import { prisma } from '@/database/prisma.service.js';

export interface DependencyCheck {
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * `GET /health/ready` and `health.alert` (P12-4) share these — a dependency
 * outage should be visible both to a load balancer polling the HTTP route
 * and to the nightly-adjacent alert job that reports it even when nobody's
 * actively polling.
 */
export async function checkDatabase(): Promise<DependencyCheck> {
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

export async function checkRedis(): Promise<DependencyCheck> {
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

export async function checkStorage(): Promise<DependencyCheck> {
  try {
    const client = new UTApi({ token: env.UPLOADTHING_TOKEN });
    await client.getUsageInfo();
    return { name: 'storage', ok: true };
  } catch (error) {
    return {
      name: 'storage',
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export async function runAllHealthChecks(): Promise<DependencyCheck[]> {
  return Promise.all([checkDatabase(), checkRedis(), checkStorage()]);
}
