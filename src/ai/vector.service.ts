import type { ChunkSimilarityMatch } from '@/modules/content/repositories/content-chunk.repository.js';

/**
 * pgvector query wrapper (ARCHITECTURE §4 folder map) — the recommender's
 * semantic-similarity signal (§8.1, weight 0.10) and `content.search`'s
 * hybrid retrieval (P5-11) both go through this rather than touching
 * `ContentChunkRepository`'s raw SQL directly.
 *
 * The OCR/embedding generation pipeline that used to populate
 * `ContentChunk.embedding` has been removed (no in-house OpenAI
 * integration — routes through the AI Trainer team's service if/when
 * needed). `ContentChunk.embedding` is therefore never populated, so this
 * always returns no matches; callers (`RagService`, `ScorerService`) treat
 * an empty/null result as "unknown" rather than failing, so semantic
 * search/recommendation signals degrade gracefully to their other signals.
 */
export class VectorService {
  embedAndFindNearest(
    _queryText: string,
    _options: { contentItemIds?: string[]; limit?: number } = {},
  ): Promise<ChunkSimilarityMatch[]> {
    return Promise.resolve([]);
  }
}
