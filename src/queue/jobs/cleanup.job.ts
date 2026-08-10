import { readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuditActorType } from '@/common/interceptors/audit.interceptor.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { AuditLogRepository } from '@/common/repositories/audit-log.repository.js';
import {
  CLEANUP_BATCH_SIZE,
  DEFAULT_AUDIT_RETENTION_DAYS,
  INFECTED_MEDIA_RETENTION_DAYS,
  ORPHANED_BLOB_RETENTION_HOURS,
  REFRESH_TOKEN_RETENTION_DAYS,
} from '@/config/constants.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { AssessmentRepository } from '@/modules/assessments/repositories/assessment.repository.js';
import { MediaAssetRepository } from '@/modules/content/repositories/media-asset.repository.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { ReportRepository } from '@/modules/reports/repositories/report.repository.js';
import { refreshTokenRepository } from '@/modules/users/users.module.js';
import type { StorageService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

const auditLogs = new AuditLogRepository();
const assessments = new AssessmentRepository();
const mediaAssets = new MediaAssetRepository();
const reports = new ReportRepository();

const SYSTEM_ACTOR: AuditActorType = 'SYSTEM';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * `§10.1` — nightly retention sweeps. **Hard boundary: never touches
 * `Report`, `Learner`, `ContentItem`, `Session` or `Assessment` rows** — the
 * transcript sweep clears `Assessment.transcriptUrl`/`transcriptRetentionUntil`
 * in place, the row itself is never deleted. Every sweep writes one audited
 * summary row (count + policy), and every delete runs in bounded batches
 * (`CLEANUP_BATCH_SIZE`) so a large purge can't lock tables or blow memory.
 *
 * `AuditLog` is tenant-scoped (`tenant.extension.ts`), so `auditSweep`'s
 * write must run inside `runWithTenant` regardless of whether the sweep it's
 * reporting was cross-org or single-org — `attributedOrgId` is just where
 * the summary row lands, not a claim the sweep was scoped to that org.
 */
async function auditSweep(
  attributedOrgId: string,
  action: string,
  count: number,
  policy: Record<string, unknown>,
): Promise<void> {
  if (count === 0) return;
  await runWithTenant(attributedOrgId, () =>
    writeAuditLog({
      organizationId: attributedOrgId,
      actorType: SYSTEM_ACTOR,
      action,
      entityType: 'CleanupSweep',
      entityId: action,
      after: { count, ...policy },
    }),
  );
}

/** Not org-scoped — `RefreshToken` has no `organizationId` column (hangs off `userId`). */
async function sweepExpiredRefreshTokens(systemOrgIdForAudit: string): Promise<number> {
  const cutoff = daysAgo(REFRESH_TOKEN_RETENTION_DAYS);
  let total = 0;
  for (;;) {
    const deleted = await refreshTokenRepository.deleteExpiredOrRevokedBefore(
      cutoff,
      CLEANUP_BATCH_SIZE,
    );
    total += deleted;
    if (deleted < CLEANUP_BATCH_SIZE) break;
  }
  await auditSweep(systemOrgIdForAudit, 'cleanup.refresh_tokens', total, {
    retentionDays: REFRESH_TOKEN_RETENTION_DAYS,
  });
  return total;
}

/**
 * GDPR — legally required. `Assessment` is on the hard-boundary list, so this
 * only ever clears `transcriptUrl`/`transcriptRetentionUntil` on the row,
 * after deleting the underlying blob; the scoring record survives untouched.
 */
async function sweepExpiredTranscripts(
  storage: StorageService,
  systemOrgIdForAudit: string,
): Promise<number> {
  const cutoff = new Date();
  let total = 0;
  for (;;) {
    const batch = await assessments.findWithExpiredTranscripts(cutoff, CLEANUP_BATCH_SIZE);
    if (batch.length === 0) break;

    for (const assessment of batch) {
      if (assessment.transcriptUrl) {
        await storage.delete(assessment.transcriptUrl).catch((error: unknown) => {
          logger.warn(
            { assessmentId: assessment.id, error },
            'cleanup: failed to delete transcript blob, clearing pointer anyway',
          );
        });
      }
      await assessments.clearExpiredTranscript(assessment.id);
      total += 1;
    }
    if (batch.length < CLEANUP_BATCH_SIZE) break;
  }
  await auditSweep(systemOrgIdForAudit, 'cleanup.transcripts', total, {
    policy: 'Assessment.transcriptRetentionUntil (computed per-org at submission time)',
  });
  return total;
}

/** `MediaAsset` isn't on the hard-boundary list — quarantined (`INFECTED`) rows are trash, not records. */
async function sweepInfectedMedia(
  storage: StorageService,
  systemOrgIdForAudit: string,
): Promise<number> {
  const cutoff = daysAgo(INFECTED_MEDIA_RETENTION_DAYS);
  let total = 0;
  for (;;) {
    const batch = await mediaAssets.findInfectedBefore(cutoff, CLEANUP_BATCH_SIZE);
    if (batch.length === 0) break;

    for (const asset of batch) {
      await storage.delete(asset.blobKey).catch((error: unknown) => {
        logger.warn(
          { mediaAssetId: asset.id, error },
          'cleanup: failed to delete infected blob, removing row anyway',
        );
      });
      await mediaAssets.deleteById(asset.id);
      total += 1;
    }
    if (batch.length < CLEANUP_BATCH_SIZE) break;
  }
  await auditSweep(systemOrgIdForAudit, 'cleanup.infected_media', total, {
    retentionDays: INFECTED_MEDIA_RETENTION_DAYS,
  });
  return total;
}

/**
 * Orphaned blobs — storage keys with no owning row in any of the three
 * tables that reference a blob (`MediaAsset`, `Report`, `Assessment`
 * transcripts). Cross-org by nature (the storage container isn't
 * per-tenant), so this reads every org's `Report` keys via `runWithTenant`
 * before comparing.
 */
async function sweepOrphanedBlobs(
  storage: StorageService,
  systemOrgIdForAudit: string,
): Promise<number> {
  const organizationIds = await organizationRepository.findAllIds();
  const reportKeys: string[] = [];
  for (const organizationId of organizationIds) {
    const keys = await runWithTenant(organizationId, () => reports.findAllBlobKeys());
    reportKeys.push(...keys);
  }

  const [mediaKeys, allBlobs, transcriptKeys] = await Promise.all([
    mediaAssets.findAllBlobKeys(),
    storage.list(),
    assessments.findAllTranscriptUrls(),
  ]);

  const known = new Set([...mediaKeys, ...reportKeys, ...transcriptKeys]);
  const cutoff = hoursAgo(ORPHANED_BLOB_RETENTION_HOURS);

  let total = 0;
  for (const blob of allBlobs) {
    if (known.has(blob.blobKey)) continue;
    if (blob.createdAt > cutoff) continue;
    await storage.delete(blob.blobKey).catch((error: unknown) => {
      logger.warn({ blobKey: blob.blobKey, error }, 'cleanup: failed to delete orphaned blob');
    });
    total += 1;
  }

  await auditSweep(systemOrgIdForAudit, 'cleanup.orphaned_blobs', total, {
    retentionHours: ORPHANED_BLOB_RETENTION_HOURS,
  });
  return total;
}

/** Best-effort — Playwright's own `--user-data-dir` temp folders under the OS tmpdir, not something our code names directly. */
async function sweepPlaywrightTempFiles(systemOrgIdForAudit: string): Promise<number> {
  const root = tmpdir();
  const cutoff = hoursAgo(24);
  let total = 0;

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    logger.warn({ error }, 'cleanup: failed to list OS tmpdir for Playwright sweep');
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('playwright')) continue;
    const fullPath = join(root, entry.name);
    try {
      const dirStat = await stat(fullPath);
      if (dirStat.mtime > cutoff) continue;
      await rm(fullPath, { recursive: true, force: true });
      total += 1;
    } catch (error) {
      logger.warn({ path: fullPath, error }, 'cleanup: failed to remove Playwright temp dir');
    }
  }

  await auditSweep(systemOrgIdForAudit, 'cleanup.playwright_temp', total, { retentionHours: 24 });
  return total;
}

/** Org-scoped — `AuditLog` carries `organizationId` directly and each org sets its own `auditRetentionDays`. */
async function sweepAuditLogsForOrganization(
  organizationId: string,
  auditRetentionDays: number,
): Promise<number> {
  const cutoff = daysAgo(auditRetentionDays);
  let total = 0;
  await runWithTenant(organizationId, async () => {
    for (;;) {
      const deleted = await auditLogs.deleteOlderThan(organizationId, cutoff, CLEANUP_BATCH_SIZE);
      total += deleted;
      if (deleted < CLEANUP_BATCH_SIZE) break;
    }
  });
  // Audited on the org whose logs were just trimmed, using its own retention policy —
  // written after the sweep, so it isn't immediately eligible for the same purge.
  await auditSweep(organizationId, 'cleanup.audit_logs', total, {
    retentionDays: auditRetentionDays,
  });
  return total;
}

export async function processCleanupJob(payload: QueuePayloads['cleanup']): Promise<void> {
  const storage = container.resolveStorage<StorageService>();
  const organizationIds = payload.organizationId
    ? [payload.organizationId]
    : await organizationRepository.findAllIds();

  if (organizationIds.length === 0) {
    logger.warn('cleanup: no organizations found, nothing to sweep');
    return;
  }

  const auditOrgId = organizationIds[0] as string;

  const [refreshTokens, transcripts, infectedMedia, orphanedBlobs, playwrightTemp] =
    await Promise.all([
      sweepExpiredRefreshTokens(auditOrgId),
      sweepExpiredTranscripts(storage, auditOrgId),
      sweepInfectedMedia(storage, auditOrgId),
      sweepOrphanedBlobs(storage, auditOrgId),
      sweepPlaywrightTempFiles(auditOrgId),
    ]);

  let auditLogRows = 0;
  for (const organizationId of organizationIds) {
    const organization = await organizationRepository.findById(organizationId);
    const retentionDays = organization?.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
    auditLogRows += await sweepAuditLogsForOrganization(organizationId, retentionDays);
  }

  logger.info(
    { refreshTokens, transcripts, infectedMedia, orphanedBlobs, playwrightTemp, auditLogRows },
    'cleanup: nightly sweep complete',
  );
}
