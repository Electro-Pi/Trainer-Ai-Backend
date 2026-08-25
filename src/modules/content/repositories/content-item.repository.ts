import type { ContentItem } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { ContentItem };

type ContentItemDelegate = typeof prisma.contentItem;

export class ContentItemRepository extends BaseRepository<ContentItem, ContentItemDelegate> {
  constructor() {
    super(prisma.contentItem, 'createdAt');
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request/job-supplied id. */
  async findByIdScoped(id: string): Promise<ContentItem | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** The recommendation candidate-pool query (ARCHITECTURE §5.4, §8.1) — every document uploaded under a skill. */
  async findBySkill(skillId: string): Promise<ContentItem[]> {
    return this.delegate.findMany({ where: { skillId } });
  }

  /** Batched existence check for scoped bulk lookups. */
  async findManyByIds(ids: string[]): Promise<ContentItem[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }
}
