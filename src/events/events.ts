// Event catalogue (ARCHITECTURE §4.4). Payloads carry IDs, not entities —
// handlers re-read what they need through repositories so a stale in-flight
// payload can't be acted on (rule 5).

export const EVENT_NAMES = [
  'session.completed',
  'session.cancelled',
  'outcome.failed.repeatedly',
  'recommendation.confirmed',
  'report.generated',
  'report.failed',
  'content.published',
  'learner.level.assigned',
  'recommendation.coverage_gap',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface EventPayloads {
  'session.completed': {
    sessionId: string;
    organizationId: string;
    learnerId: string;
    verdict: string;
  };
  'session.cancelled': {
    sessionId: string;
    organizationId: string;
    learnerId: string;
  };
  'outcome.failed.repeatedly': {
    learnerId: string;
    organizationId: string;
    outcomeId: string;
    attemptCount: number;
  };
  'recommendation.confirmed': {
    recommendationId: string;
    organizationId: string;
    learnerId: string;
    confirmedById: string;
  };
  'report.generated': {
    reportId: string;
    organizationId: string;
    sessionId?: string;
    planId?: string;
  };
  'report.failed': {
    reportId: string;
    organizationId: string;
    reason: string;
  };
  'content.published': {
    contentItemId: string;
    organizationId: string;
  };
  'learner.level.assigned': {
    learnerId: string;
    organizationId: string;
    trackId: string;
    levelId: string;
    assignedById: string;
  };
  'recommendation.coverage_gap': {
    recommendationId: string;
    organizationId: string;
    learnerId: string;
    outcomeIds: string[];
  };
}
