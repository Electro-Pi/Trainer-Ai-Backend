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

// Prisma pool + pg-boss pool are capped (DATABASE_POOL_MAX, QUEUE_POOL_MAX,
// 5 each by default) but a duplicate/orphaned process — e.g. an old systemd
// worker unit left running after a deploy that merged the worker into this
// process — stacks a second, uncapped-from-this-process's-view set of
// connections on top. That's exactly what silently grew to 67 connections
// (out of 100) before this check existed, starving Postgres down to
// SUPERUSER-only slots. This threshold is well above the ~10 this process
// alone should ever hold, so it only fires when something else is piling on.
const CONNECTION_COUNT_WARNING_THRESHOLD = 20;

// Connections idle longer than this are almost certainly leaked (a healthy
// pg-boss poll cycle goes idle→active again within seconds), not mid-request
// — safe to reclaim. `pg_terminate_backend` only affects rows this role owns
// (Postgres blocks cross-role termination without superuser, confirmed by
// the original 53300 error), so this can only ever kill this app's own
// leaked connections, never another service's.
const IDLE_RECLAIM_MINUTES = 10;

export async function checkConnectionPoolHealth(): Promise<DependencyCheck> {
  try {
    const result = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()`;
    const count = Number(result[0]?.count ?? 0);

    if (count <= CONNECTION_COUNT_WARNING_THRESHOLD) {
      return { name: 'connection-pool', ok: true };
    }

    const reclaimed = await prisma.$queryRaw<{ pid: number }[]>`
      SELECT pg_terminate_backend(pid) AS terminated, pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'idle'
        AND state_change < now() - (${IDLE_RECLAIM_MINUTES} || ' minutes')::interval
        AND pid <> pg_backend_pid()
    `;

    return {
      name: 'connection-pool',
      ok: false,
      error: `${count} connections open (expected under ${CONNECTION_COUNT_WARNING_THRESHOLD}) — reclaimed ${reclaimed.length} idle connection(s); check for a duplicate/orphaned worker process if this recurs`,
    };
  } catch (error) {
    return {
      name: 'connection-pool',
      ok: false,
      error: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export async function runAllHealthChecks(): Promise<DependencyCheck[]> {
  return Promise.all([checkDatabase(), checkStorage(), checkConnectionPoolHealth()]);
}
