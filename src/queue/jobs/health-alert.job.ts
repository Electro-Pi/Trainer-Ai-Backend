import { container } from '@/config/container.js';
import { runAllHealthChecks } from '@/health/health-checks.js';
import { logger } from '@/logger/logger.service.js';
import type { ErrorTracker } from '@/shared-types.js';

/**
 * `P12-4` — health alerting. `/health/ready` only tells you the state of the
 * system at the moment someone (a load balancer) happens to ask; this job
 * checks the same three dependencies on a fixed interval and reports a
 * failure through the error tracker even when nobody's polling, so an outage
 * surfaces without needing a separate alerting service.
 */
export async function processHealthAlertJob(): Promise<void> {
  const checks = await runAllHealthChecks();
  const failed = checks.filter((check) => !check.ok);

  if (failed.length === 0) return;

  logger.error({ failed }, 'health.alert: one or more dependencies are unhealthy');

  const errorTracker = container.resolveErrorTracker<ErrorTracker>();
  for (const check of failed) {
    errorTracker.captureException(new Error(`Health check failed: ${check.name}`), {
      check: check.name,
      detail: check.error,
    });
  }
}
