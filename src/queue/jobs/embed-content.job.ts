import { chunkText } from '@/ai/chunk-text.js';
import { container } from '@/config/container.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { logger } from '@/logger/logger.service.js';
import { ContentChunkRepository } from '@/modules/content/repositories/content-chunk.repository.js';
import { ContentItemRepository } from '@/modules/content/repositories/content-item.repository.js';
import { MediaAssetRepository } from '@/modules/content/repositories/media-asset.repository.js';
import type { EmbeddingService } from '@/shared-types.js';

import type { QueuePayloads } from '../queues.js';

const contentItems = new ContentItemRepository();
const mediaAssets = new MediaAssetRepository();
const contentChunks = new ContentChunkRepository();

/**
 * `CM-09` — chunks the content item's own `textBody` plus every clean media
 * asset's `extractedText`, embeds each chunk, and stores it in `ContentChunk`.
 * Runs after publish and after `media.extract` (§10 table). Ours, not the AI
 * team's — feeds the recommender's semantic-similarity signal (MEMORY D-15).
 */
export async function processEmbedContentJob(
  payload: QueuePayloads['content.embed'],
): Promise<void> {
  await runWithTenant(payload.organizationId, async () => {
    const contentItem = await contentItems.findByIdScoped(payload.contentItemId);
    if (!contentItem) {
      logger.warn(
        { contentItemId: payload.contentItemId },
        'embed-content: content item not found, skipping',
      );
      return;
    }

    const mediaForItem = await mediaAssets.findByContentItem(contentItem.id);
    const cleanMedia = mediaForItem.filter((m) => m.scanStatus === 'CLEAN' && m.extractedText);

    const sources: { text: string; mediaAssetId: string | null }[] = [
      ...(contentItem.textBody ? [{ text: contentItem.textBody, mediaAssetId: null }] : []),
      ...cleanMedia.map((m) => ({ text: m.extractedText!, mediaAssetId: m.id })),
    ];

    await contentChunks.deleteByContentItem(contentItem.id);

    const embedding = container.resolveEmbedding<EmbeddingService>();
    let chunkIndex = 0;

    for (const source of sources) {
      for (const chunk of chunkText(source.text)) {
        const created = await contentChunks.create({
          contentItemId: contentItem.id,
          mediaAssetId: source.mediaAssetId,
          chunkIndex: chunkIndex++,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
        } as never);

        const vector = await embedding.embed(chunk.text);
        await contentChunks.setEmbedding(created.id, vector);
      }
    }

    logger.info(
      { contentItemId: contentItem.id, chunkCount: chunkIndex },
      'Content embedding complete',
    );
  });
}
