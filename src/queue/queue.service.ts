import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { env } from '@/config/env.js';

import {
  QUEUE_DEFAULT_JOB_OPTIONS,
  QUEUE_NAMES,
  type QueueName,
  type QueuePayloads,
} from './queues.js';

export function createQueueConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

/**
 * Typed enqueue API — one BullMQ `Queue` instance per queue name, created
 * lazily and cached so P0 code (nothing enqueues yet) doesn't pay Redis
 * connection cost per queue until a phase actually uses one.
 */
export class QueueService {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly connection: Redis) {}

  private getQueue<K extends QueueName>(name: K): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS[name],
      });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue<K extends QueueName>(
    name: K,
    payload: QueuePayloads[K],
    options?: { jobId?: string; delayMs?: number },
  ): Promise<void> {
    const queue = this.getQueue(name);
    await queue.add(name, payload, {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      ...(options?.delayMs !== undefined ? { delay: options.delayMs } : {}),
    });
  }

  /** Removes a job by its `jobId` if it's still pending/delayed — used to cancel a stale `session.reminder` on reschedule. A no-op if the job already ran or never existed. */
  async removeJob<K extends QueueName>(name: K, jobId: string): Promise<void> {
    const queue = this.getQueue(name);
    const job = await queue.getJob(jobId);
    await job?.remove();
  }

  /**
   * Registers (or re-registers, idempotently) a cron-repeating job —
   * `effectiveness.recompute` nightly (`RC-13`, P10-5) today, `cleanup`
   * nightly (§10.1, P12) later. `upsertJobScheduler` is BullMQ v6's
   * replacement for the deprecated `queue.add({ repeat })` form — calling it
   * again with the same `schedulerId` updates the pattern in place instead of
   * creating a duplicate scheduler, so this is safe to call on every worker
   * boot.
   */
  async scheduleCron<K extends QueueName>(
    schedulerId: string,
    name: K,
    payload: QueuePayloads[K],
    cronPattern: string,
  ): Promise<void> {
    const queue = this.getQueue(name);
    await queue.upsertJobScheduler(
      schedulerId,
      { pattern: cronPattern, tz: 'UTC' },
      { name, data: payload },
    );
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
  }
}

export function createQueueService(connection: Redis): QueueService {
  return new QueueService(connection);
}

export { QUEUE_NAMES };
export type { QueueName, QueuePayloads };
