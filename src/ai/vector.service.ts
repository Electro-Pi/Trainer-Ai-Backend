import { container } from '@/config/container.js';
import type { ChunkSimilarityMatch } from '@/modules/content/repositories/content-chunk.repository.js';
import { ContentChunkRepository } from '@/modules/content/repositories/content-chunk.repository.js';
import type { EmbeddingService } from '@/shared-types.js';

/**
 * pgvector query wrapper (ARCHITECTURE §4 folder map) — the recommender's
 * semantic-similarity signal (§8.1, weight 0.10) and `content.search`'s
 * hybrid retrieval (P5-11) both go through this rather than touching
 * `ContentChunkRepository`'s raw SQL directly.
 */
export class VectorService {
  private readonly chunks = new ContentChunkRepository();

  async embedAndFindNearest(
    queryText: string,
    options: { contentItemIds?: string[]; limit?: number } = {},
  ): Promise<ChunkSimilarityMatch[]> {
    const embedding = container.resolveEmbedding<EmbeddingService>();
    const vector = await embedding.embed(queryText);
    return this.chunks.findNearest(vector, options);
  }
}
