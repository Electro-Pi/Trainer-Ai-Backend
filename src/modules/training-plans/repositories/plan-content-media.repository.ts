import type { PlanContentMedia } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { PlanContentMedia };

type PlanContentMediaDelegate = typeof prisma.planContentMedia;

export class PlanContentMediaRepository extends BaseRepository<
  PlanContentMedia,
  PlanContentMediaDelegate
> {
  constructor() {
    super(prisma.planContentMedia, 'createdAt');
  }

  async findByContentSnapshot(contentSnapshotId: string): Promise<PlanContentMedia[]> {
    return this.delegate.findMany({ where: { contentSnapshotId } });
  }
}
