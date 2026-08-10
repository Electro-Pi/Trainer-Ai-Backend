import { PgBoss } from 'pg-boss';

import { env } from '@/config/env.js';

import {
  QUEUE_DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  type QueueName,
  type QueuePayloads,
} from './queues.js';

export function createQueueConnection(): PgBoss {
  return new PgBoss(env.DATABASE_URL);
}

/**
 * Typed enqueue API — one `PgBoss` instance shared by every queue, with each
 * queue created lazily (and cached) on first use so P0 code (nothing
 * enqueues yet) doesn't pay setup cost per queue until a phase actually uses
 * one.
 */
export class QueueService {
  private readonly ensuredQueues = new Set<QueueName>();
  private startPromise: Promise<void> | null = null;

  constructor(private readonly boss: PgBoss) {}

  private async start(): Promise<void> {
    this.startPromise ??= this.boss.start().then(() => undefined);
    await this.startPromise;
  }

  private async ensureQueue(name: QueueName): Promise<void> {
    await this.start();
    if (this.ensuredQueues.has(name)) return;
    const { retryLimit, retryDelay, retryBackoff } = QUEUE_DEFAULT_JOB_OPTIONS[name];
    await this.boss.createQueue(name, {
      retryLimit,
      ...(retryDelay !== undefined ? { retryDelay } : {}),
      ...(retryBackoff !== undefined ? { retryBackoff } : {}),
    });
    this.ensuredQueues.add(name);
  }

  async enqueue<K extends QueueName>(
    name: K,
    payload: QueuePayloads[K],
    options?: { jobId?: string; delayMs?: number },
  ): Promise<void> {
    await this.ensureQueue(name);
    // `jobId` maps to pg-boss's `singletonKey`, not its `id` — `id` is a real
    // uuid column, `singletonKey` is the arbitrary-string dedup/lookup handle
    // BullMQ's `jobId` used to be (e.g. `meeting-create-<sessionId>`).
    await this.boss.send(name, payload, {
      ...(options?.jobId ? { singletonKey: options.jobId } : {}),
      ...(options?.delayMs !== undefined ? { startAfter: Math.ceil(options.delayMs / 1000) } : {}),
    });
  }

  /** Removes a job by its `jobId` (pg-boss `singletonKey`) if it's still pending/active — used to cancel a stale `session.reminder` on reschedule. A no-op if the job already ran or never existed. */
  async removeJob<K extends QueueName>(name: K, jobId: string): Promise<void> {
    await this.ensureQueue(name);
    const jobs = await this.boss.findJobs(name, { key: jobId });
    const ids = jobs.map((job) => job.id);
    if (ids.length === 0) return;
    await this.boss.cancel(name, ids).catch(() => undefined);
    await this.boss.deleteJob(name, ids).catch(() => undefined);
  }

  /**
   * Registers (or re-registers, idempotently) a cron-repeating job —
   * `effectiveness.recompute` nightly (`RC-13`, P10-5) today, `cleanup`
   * nightly (§10.1, P12) later, `health.alert` every 5 minutes. pg-boss's
   * `schedule()` upserts by queue name, so calling it again with the same
   * name/cron updates the pattern in place instead of creating a duplicate
   * — safe to call on every worker boot.
   */
  async scheduleCron<K extends QueueName>(
    name: K,
    payload: QueuePayloads[K],
    cronPattern: string,
  ): Promise<void> {
    await this.ensureQueue(name);
    await this.boss.schedule(name, cronPattern, payload, { tz: 'UTC' });
  }

  async closeAll(): Promise<void> {
    await this.boss.stop();
  }

  /** Every queue in the catalogue, ensured so `admin/queues` (P12-4) can report on the full set. */
  async ensureAllQueues(): Promise<void> {
    for (const name of QUEUE_NAMES) {
      await this.ensureQueue(name);
    }
  }

  getBoss(): PgBoss {
    return this.boss;
  }
}

export function createQueueService(connection: PgBoss): QueueService {
  return new QueueService(connection);
}

export { QUEUE_NAMES };
export type { QueueName, QueuePayloads };
