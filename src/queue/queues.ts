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

export interface QueueRetryOptions {
  retryLimit: number;
  retryDelay?: number;
  retryBackoff?: boolean;
}

/**
 * Retry counts per ARCHITECTURE §10's job table, translated from BullMQ's
 * `attempts`/`backoff.delay` (ms) to pg-boss's `retryLimit` (retries after
 * the first try, so `attempts - 1`) and `retryDelay` (seconds).
 */
export const QUEUE_DEFAULT_JOB_OPTIONS: Record<QueueName, QueueRetryOptions> = {
  'media.scan': { retryLimit: 2, retryDelay: 5, retryBackoff: true },
  'media.extract': { retryLimit: 2, retryDelay: 5, retryBackoff: true },
  'content.embed': { retryLimit: 2, retryDelay: 5, retryBackoff: true },
  'meeting.create': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'meeting.update': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'session.reminder': { retryLimit: 1, retryDelay: 30, retryBackoff: true },
  'report.generate': { retryLimit: 2, retryDelay: 10, retryBackoff: true },
  'report.send': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'effectiveness.recompute': { retryLimit: 0 },
  'outcome.escalate': { retryLimit: 0 },
  cleanup: { retryLimit: 0 },
  'health.alert': { retryLimit: 0 },
};
