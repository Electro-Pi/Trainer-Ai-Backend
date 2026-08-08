import { container } from '@/config/container.js';
import { logger } from '@/logger/logger.service.js';
import { MediaAssetRepository } from '@/modules/content/repositories/media-asset.repository.js';
import type { Scanner, StorageService } from '@/shared-types.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const mediaAssets = new MediaAssetRepository();

/**
 * `CM-07` — publish is blocked unless `MediaAsset.scanStatus = CLEAN`
 * (enforced in the content service, not here). This job only runs the scan
 * and records the result; on `CLEAN` it enqueues `media.extract` to continue
 * the pipeline (§10 table), never inline.
 */
export async function processScanMediaJob(payload: QueuePayloads['media.scan']): Promise<void> {
  const asset = await mediaAssets.findById(payload.mediaAssetId);
  if (!asset) {
    logger.warn(
      { mediaAssetId: payload.mediaAssetId },
      'scan-media: media asset not found, skipping',
    );
    return;
  }

  const storage = container.resolveStorage<StorageService>();
  const scanner = container.resolveScanner<Scanner>();

  const downloadUrl = await storage.getDownloadUrl(asset.blobKey, 300);
  const response = await fetch(downloadUrl);
  const data = Buffer.from(await response.arrayBuffer());

  const result = await scanner.scan(data);
  await mediaAssets.setScanStatus(asset.id, result.status);

  logger.info({ mediaAssetId: asset.id, status: result.status }, 'Media scan complete');

  if (result.status === 'CLEAN') {
    await queueService.enqueue('media.extract', {
      mediaAssetId: asset.id,
      organizationId: payload.organizationId,
    });
  }
}
