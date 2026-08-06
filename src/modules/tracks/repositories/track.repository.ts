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

  /**
   * `BaseRepository.findById` uses `findUnique`, which the tenant extension
   * cannot scope (it can't merge `organizationId` into a unique `where` —
   * see the extension's own doc comment). `findFirst` IS scoped, so this is
   * the safe way to resolve a `Track` by id when the caller only trusts a
   * request-supplied id (e.g. a level assignment's `trackId`).
   */
  async findByIdScoped(id: string): Promise<Track | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
