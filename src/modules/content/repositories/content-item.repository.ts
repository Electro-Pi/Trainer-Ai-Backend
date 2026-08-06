import type { ContentItem, ContentStatus, Language } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type ContentItemDelegate = typeof prisma.contentItem;

export class ContentItemRepository extends BaseRepository<ContentItem, ContentItemDelegate> {
  constructor() {
    super(prisma.contentItem, 'createdAt');
  }

  /** The recommendation candidate-pool query (ARCHITECTURE §5.4, §8.1). */
  async findCandidates(params: {
    trackId: string;
    levelId: string;
    language: Language;
    status?: ContentStatus;
  }): Promise<ContentItem[]> {
    return this.delegate.findMany({
      where: {
        trackId: params.trackId,
        levelId: params.levelId,
        language: params.language,
        status: params.status ?? 'PUBLISHED',
      },
    });
  }
}
