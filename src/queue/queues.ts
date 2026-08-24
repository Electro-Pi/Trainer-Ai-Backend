// Queue catalogue (ARCHITECTURE §10). Jobs are added by the phases that
// need them — this only defines names and payload contracts so P0's queue
// plumbing has something concrete to type against.

export const QUEUE_NAMES = [
  'media.scan',
  'meeting.create',
  'meeting.update',
  'session.reminder',
  'agent.dispatch',
  'report.generate',
  'report.send',
  'effectiveness.recompute',
  'outcome.escalate',
  'cleanup',
  'health.alert',
  'invite.send',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface QueuePayloads {
  'media.scan': { mediaAssetId: string; organizationId: string };
  'meeting.create': { sessionId: string; organizationId: string };
  'meeting.update': { sessionId: string; organizationId: string };
  'session.reminder': { sessionId: string; organizationId: string };
  'agent.dispatch': { sessionId: string; organizationId: string };
  'report.generate': { reportId: string; organizationId: string };
  'report.send': { reportId: string; organizationId: string };
  'effectiveness.recompute': { organizationId?: string };
  'outcome.escalate': { learnerId: string; organizationId: string; outcomeId: string };
  cleanup: { organizationId?: string };
  'health.alert': Record<string, never>;
  'invite.send': { portalInviteId: string; organizationId: string };
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
  'meeting.create': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'meeting.update': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'session.reminder': { retryLimit: 1, retryDelay: 30, retryBackoff: true },
  'agent.dispatch': { retryLimit: 2, retryDelay: 10, retryBackoff: true },
  'report.generate': { retryLimit: 2, retryDelay: 10, retryBackoff: true },
  'report.send': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
  'effectiveness.recompute': { retryLimit: 0 },
  'outcome.escalate': { retryLimit: 0 },
  cleanup: { retryLimit: 0 },
  'health.alert': { retryLimit: 0 },
  'invite.send': { retryLimit: 4, retryDelay: 10, retryBackoff: true },
};
