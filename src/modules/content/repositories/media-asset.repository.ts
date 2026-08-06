import type { MediaAsset } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type MediaAssetDelegate = typeof prisma.mediaAsset;

export class MediaAssetRepository extends BaseRepository<MediaAsset, MediaAssetDelegate> {
  constructor() {
    super(prisma.mediaAsset, 'createdAt');
  }

  async findByContentItem(contentItemId: string): Promise<MediaAsset[]> {
    return this.delegate.findMany({ where: { contentItemId } });
  }
}
