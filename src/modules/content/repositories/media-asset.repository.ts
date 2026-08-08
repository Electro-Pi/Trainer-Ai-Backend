import type { MediaAsset, MediaScanStatus } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { MediaAsset };

type MediaAssetDelegate = typeof prisma.mediaAsset;

export class MediaAssetRepository extends BaseRepository<MediaAsset, MediaAssetDelegate> {
  constructor() {
    super(prisma.mediaAsset, 'createdAt');
  }

  async findByContentItem(contentItemId: string): Promise<MediaAsset[]> {
    return this.delegate.findMany({ where: { contentItemId } });
  }

  /** `MediaAsset` has no own `organizationId` (reached via `ContentItem`) — no tenant scoping needed for a direct-id lookup by jobs. */
  async setScanStatus(id: string, scanStatus: MediaScanStatus): Promise<MediaAsset> {
    return this.update(id, { scanStatus, processedAt: new Date() } as never);
  }

  async setExtractedText(
    id: string,
    extractedText: string,
    pageCount: number | undefined,
  ): Promise<MediaAsset> {
    return this.update(id, { extractedText, pageCount: pageCount ?? null } as never);
  }
}
