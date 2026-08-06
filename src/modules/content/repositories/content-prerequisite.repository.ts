import type { ContentPrerequisite } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

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
}
