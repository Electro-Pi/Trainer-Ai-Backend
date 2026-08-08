import { container } from '@/config/container.js';
import { logger } from '@/logger/logger.service.js';
import { MediaAssetRepository } from '@/modules/content/repositories/media-asset.repository.js';
import type { OcrService, StorageService } from '@/shared-types.js';

import { queueService } from '../queue-instance.js';
import type { QueuePayloads } from '../queues.js';

const mediaAssets = new MediaAssetRepository();

/**
 * `CM-05` — runs after `media.scan` reports `CLEAN` (§10 table). Populates
 * `MediaAsset.extractedText`/`pageCount`, then enqueues `content.embed` so
 * the extracted text (not just the item's own `textBody`) contributes to
 * the chunk set the recommender's semantic-similarity signal reads (`CM-09`).
 */
export async function processExtractTextJob(
  payload: QueuePayloads['media.extract'],
): Promise<void> {
  const asset = await mediaAssets.findById(payload.mediaAssetId);
  if (!asset) {
    logger.warn(
      { mediaAssetId: payload.mediaAssetId },
      'extract-text: media asset not found, skipping',
    );
    return;
  }

  if (asset.scanStatus !== 'CLEAN') {
    logger.warn(
      { mediaAssetId: asset.id, scanStatus: asset.scanStatus },
      'extract-text: asset is not CLEAN, skipping extraction',
    );
    return;
  }

  const storage = container.resolveStorage<StorageService>();
  const ocr = container.resolveOcr<OcrService>();

  const downloadUrl = await storage.getDownloadUrl(asset.blobKey, 300);
  const response = await fetch(downloadUrl);
  const data = Buffer.from(await response.arrayBuffer());

  const { text, pageCount } = await ocr.extractText(data, asset.mimeType);
  await mediaAssets.setExtractedText(asset.id, text, pageCount);

  logger.info({ mediaAssetId: asset.id, textLength: text.length }, 'Text extraction complete');

  await queueService.enqueue('content.embed', {
    contentItemId: asset.contentItemId,
    organizationId: payload.organizationId,
  });
}
