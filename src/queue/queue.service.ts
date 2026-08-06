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
    options?: { jobId?: string },
  ): Promise<void> {
    const queue = this.getQueue(name);
    await queue.add(name, payload, options?.jobId ? { jobId: options.jobId } : undefined);
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
