import type { MediaAsset } from '@prisma/client';

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

  async setExtractedText(
    id: string,
    extractedText: string,
    pageCount: number | undefined,
  ): Promise<MediaAsset> {
    return this.update(id, { extractedText, pageCount: pageCount ?? null } as never);
  }

  /** Every blob key on record — `cleanup.job`'s orphaned-blob sweep excludes these from deletion. */
  async findAllBlobKeys(): Promise<string[]> {
    const rows = await this.delegate.findMany({ take: 1_000_000 });
    return rows.map((row) => row.blobKey);
  }
}
