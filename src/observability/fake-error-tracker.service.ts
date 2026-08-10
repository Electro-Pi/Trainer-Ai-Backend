import { logger } from '@/logger/logger.service.js';
import type { ErrorTracker } from '@/shared-types.js';

/** Dev/test default (ARCHITECTURE §4.5) — logs instead of reporting, never calls out from dev. */
export class FakeErrorTracker implements ErrorTracker {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    logger.debug({ error, context }, 'FakeErrorTracker.captureException — not reported');
  }
}
