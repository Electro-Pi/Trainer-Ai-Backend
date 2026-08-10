import type { JobsOptions } from 'bullmq';

// Queue catalogue (ARCHITECTURE §10). Jobs are added by the phases that
// need them — this only defines names and payload contracts so P0's queue
// plumbing has something concrete to type against.

export const QUEUE_NAMES = [
  'media.scan',
  'media.extract',
  'content.embed',
  'meeting.create',
  'meeting.update',
  'session.reminder',
  'report.generate',
  'report.send',
  'effectiveness.recompute',
  'outcome.escalate',
  'cleanup',
  'health.alert',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface QueuePayloads {
  'media.scan': { mediaAssetId: string; organizationId: string };
  'media.extract': { mediaAssetId: string; organizationId: string };
  'content.embed': { contentItemId: string; organizationId: string };
  'meeting.create': { sessionId: string; organizationId: string };
  'meeting.update': { sessionId: string; organizationId: string };
  'session.reminder': { sessionId: string; organizationId: string };
  'report.generate': { reportId: string; organizationId: string };
  'report.send': { reportId: string; organizationId: string };
  'effectiveness.recompute': { organizationId?: string };
  'outcome.escalate': { learnerId: string; organizationId: string; outcomeId: string };
  cleanup: { organizationId?: string };
  'health.alert': Record<string, never>;
}

const EXPONENTIAL_BACKOFF = (delayMs: number): NonNullable<JobsOptions['backoff']> => ({
  type: 'exponential',
  delay: delayMs,
});

/**
 * Retry counts per ARCHITECTURE §10's job table. `jobId` for idempotency
 * (meeting.create keyed by session.id, etc.) is supplied by the caller when
 * enqueuing — it is entity-specific and not knowable here.
 */
export const QUEUE_DEFAULT_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  'media.scan': {
    attempts: 3,
    backoff: EXPONENTIAL_BACKOFF(5_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'media.extract': {
    attempts: 3,
    backoff: EXPONENTIAL_BACKOFF(5_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'content.embed': {
    attempts: 3,
    backoff: EXPONENTIAL_BACKOFF(5_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'meeting.create': {
    attempts: 5,
    backoff: EXPONENTIAL_BACKOFF(10_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'meeting.update': {
    attempts: 5,
    backoff: EXPONENTIAL_BACKOFF(10_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'session.reminder': {
    attempts: 2,
    backoff: EXPONENTIAL_BACKOFF(30_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'report.generate': {
    attempts: 3,
    backoff: EXPONENTIAL_BACKOFF(10_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'report.send': {
    attempts: 5,
    backoff: EXPONENTIAL_BACKOFF(10_000),
    removeOnComplete: true,
    removeOnFail: false,
  },
  'effectiveness.recompute': { attempts: 1, removeOnComplete: true, removeOnFail: false },
  'outcome.escalate': { attempts: 1, removeOnComplete: true, removeOnFail: false },
  cleanup: { attempts: 1, removeOnComplete: true, removeOnFail: false },
  'health.alert': { attempts: 1, removeOnComplete: true, removeOnFail: false },
};
