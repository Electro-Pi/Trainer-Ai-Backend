import * as Sentry from '@sentry/node';

import { env } from '@/config/env.js';
import type { ErrorTracker } from '@/shared-types.js';

let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  initialized = true;
}

/** Real implementation (ARCHITECTURE §4.5) — never constructed unless `ERROR_TRACKING_PROVIDER=sentry`. */
export class SentryErrorTracker implements ErrorTracker {
  constructor() {
    ensureInitialized();
  }

  captureException(error: unknown, context?: Record<string, unknown>): void {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}
