import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { ContentEffectivenessRepository } from '@/modules/recommendations/repositories/content-effectiveness.repository.js';

import type { QueuePayloads } from '../queues.js';

const contentEffectiveness = new ContentEffectivenessRepository();

async function recomputeOne(organizationId: string): Promise<void> {
  const rowCount = await runWithTenant(organizationId, () =>
    contentEffectiveness.recomputeForOrganization(organizationId),
  );
  logger.info({ organizationId, rowCount }, 'Recomputed content effectiveness');
}

/**
 * `RC-13`, `PF-07` (P10-5) — nightly cron via BullMQ's repeatable-job
 * scheduler (`scheduleRepeatableJobs`, worker.ts). `organizationId` is
 * omitted on the scheduled cron run, so every tenant is swept; a caller can
 * still enqueue with an `organizationId` for an on-demand single-org
 * recompute. Never runs inline — the recommender's effectiveness signal
 * (`signals/effectiveness.signal.ts`) only ever reads the persisted result.
 */
export async function processRecomputeEffectivenessJob(
  payload: QueuePayloads['effectiveness.recompute'],
): Promise<void> {
  if (payload.organizationId) {
    await recomputeOne(payload.organizationId);
    return;
  }

  const organizationIds = await organizationRepository.findAllIds();
  for (const organizationId of organizationIds) {
    await recomputeOne(organizationId);
  }
}
