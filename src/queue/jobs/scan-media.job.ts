import { container } from '@/config/container.js';
import { logger } from '@/logger/logger.service.js';
import { MediaAssetRepository } from '@/modules/content/repositories/media-asset.repository.js';
import { PlanContentMediaRepository } from '@/modules/training-plans/repositories/plan-content-media.repository.js';
import type { Scanner, StorageService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

const mediaAssets = new MediaAssetRepository();
const planContentMedia = new PlanContentMediaRepository();

/**
 * `CM-07` — publish is blocked unless `MediaAsset.scanStatus = CLEAN`
 * (enforced in the content service, not here). This job only runs the scan
 * and records the result.
 *
 * `payload.mediaAssetId` is looked up against the master `MediaAsset` table
 * first, falling back to `PlanContentMedia` — a plan-snapshot upload
 * (`PlanContentMediaService.upload`) enqueues into this same queue since the
 * malware-scan step applies equally to both.
 */
export async function processScanMediaJob(payload: QueuePayloads['media.scan']): Promise<void> {
  const asset = await mediaAssets.findById(payload.mediaAssetId);
  if (asset) {
    const storage = container.resolveStorage<StorageService>();
    const scanner = container.resolveScanner<Scanner>();

    const downloadUrl = await storage.getDownloadUrl(asset.blobKey, 300);
    const response = await fetch(downloadUrl);
    const data = Buffer.from(await response.arrayBuffer());

    const result = await scanner.scan(data);
    await mediaAssets.setScanStatus(asset.id, result.status);

    logger.info({ mediaAssetId: asset.id, status: result.status }, 'Media scan complete');
    return;
  }

  const planMedia = await planContentMedia.findById(payload.mediaAssetId);
  if (!planMedia) {
    logger.warn(
      { mediaAssetId: payload.mediaAssetId },
      'scan-media: media asset not found in either MediaAsset or PlanContentMedia, skipping',
    );
    return;
  }

  const storage = container.resolveStorage<StorageService>();
  const scanner = container.resolveScanner<Scanner>();

  const downloadUrl = await storage.getDownloadUrl(planMedia.blobKey, 300);
  const response = await fetch(downloadUrl);
  const data = Buffer.from(await response.arrayBuffer());

  const result = await scanner.scan(data);
  await planContentMedia.update(planMedia.id, {
    scanStatus: result.status,
    processedAt: new Date(),
  } as never);

  logger.info(
    { planContentMediaId: planMedia.id, status: result.status },
    'Plan content media scan complete',
  );
}
