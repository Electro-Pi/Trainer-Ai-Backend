import type { Prisma, Track } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type TrackDelegate = typeof prisma.track;

export class TrackRepository extends BaseRepository<Track, TrackDelegate> {
  constructor() {
    super(prisma.track, 'sortOrder');
  }

  async findByKey(key: string): Promise<Track | null> {
    return this.delegate.findFirst({ where: { key } });
  }

  async findManyByTrack(where: Prisma.TrackWhereInput): Promise<Track[]> {
    return this.delegate.findMany({ where, orderBy: { sortOrder: 'asc' } });
  }
}
