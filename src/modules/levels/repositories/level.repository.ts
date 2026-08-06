import type { Level } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type LevelDelegate = typeof prisma.level;

/** Not directly tenant-scoped — reached via `trackId` → `Track.organizationId`. */
export class LevelRepository extends BaseRepository<Level, LevelDelegate> {
  constructor() {
    super(prisma.level, 'order');
  }

  async findByTrack(trackId: string): Promise<Level[]> {
    return this.delegate.findMany({ where: { trackId }, orderBy: { order: 'asc' } });
  }
}
