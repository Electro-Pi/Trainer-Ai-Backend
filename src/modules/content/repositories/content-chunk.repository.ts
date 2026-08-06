import type { ContentChunk } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type ContentChunkDelegate = typeof prisma.contentChunk;

export interface ChunkSimilarityMatch {
  id: string;
  contentItemId: string;
  chunkIndex: number;
  text: string;
  distance: number;
}

/**
 * `embedding` is `Unsupported("vector(1536)")` in schema.prisma (P1-2) —
 * Prisma's query engine cannot read/write or filter that column through the
 * normal delegate, only through `$queryRaw`/`$executeRaw`. Every other
 * column goes through `BaseRepository` as usual; embedding I/O is isolated
 * to the two methods below, both parameterized (never string-interpolated)
 * to stay injection-safe despite bypassing the type-safe query builder.
 */
export class ContentChunkRepository extends BaseRepository<ContentChunk, ContentChunkDelegate> {
  constructor() {
    super(prisma.contentChunk, 'chunkIndex');
  }

  async findByContentItem(contentItemId: string): Promise<ContentChunk[]> {
    return this.delegate.findMany({ where: { contentItemId }, orderBy: { chunkIndex: 'asc' } });
  }

  async setEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    await prisma.$executeRaw`
      UPDATE "content_chunks" SET "embedding" = ${vectorLiteral}::vector WHERE "id" = ${chunkId}
    `;
  }

  /** Cosine-distance nearest neighbors — the recommender's semantic-similarity signal (§8.1, weight 0.10). */
  async findNearest(
    embedding: number[],
    options: { contentItemIds?: string[]; limit?: number } = {},
  ): Promise<ChunkSimilarityMatch[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const limit = options.limit ?? 10;

    const contentFilter =
      options.contentItemIds && options.contentItemIds.length > 0
        ? Prisma.sql`AND "contentItemId" IN (${Prisma.join(options.contentItemIds)})`
        : Prisma.empty;

    return prisma.$queryRaw<ChunkSimilarityMatch[]>`
      SELECT "id", "contentItemId", "chunkIndex", "text",
             "embedding" <=> ${vectorLiteral}::vector AS distance
      FROM "content_chunks"
      WHERE "embedding" IS NOT NULL
      ${contentFilter}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
  }
}
