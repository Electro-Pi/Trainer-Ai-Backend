import type { ContentPrerequisite } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { ContentPrerequisite };

type ContentPrerequisiteDelegate = typeof prisma.contentPrerequisite;

/** Feeds the recommender's topological ordering (`RC-02`, ARCHITECTURE §8.1). */
export class ContentPrerequisiteRepository extends BaseRepository<
  ContentPrerequisite,
  ContentPrerequisiteDelegate
> {
  constructor() {
    super(prisma.contentPrerequisite, 'createdAt');
  }

  async findByContentItem(contentItemId: string): Promise<ContentPrerequisite[]> {
    return this.delegate.findMany({ where: { contentItemId } });
  }

  /** Batched variant for the recommender's ordering step (`P6-4`) — one query for a whole candidate set. */
  async findByContentItems(contentItemIds: string[]): Promise<ContentPrerequisite[]> {
    if (contentItemIds.length === 0) return [];
    return this.delegate.findMany({ where: { contentItemId: { in: contentItemIds } } });
  }
}
