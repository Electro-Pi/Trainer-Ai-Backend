import { clamp01, type SignalContext } from './signal.types.js';

/**
 * Weight 0.10 (ARCHITECTURE §8.1). `semanticDistance` is pgvector cosine
 * distance (0 = identical, 2 = maximally dissimilar) between the candidate's
 * `ContentChunk` embeddings and the outcome statement's embedding, resolved
 * by `ScorerService` via `VectorService` before scoring (P5-6). No chunk
 * embedded yet (content not re-embedded, or `FakeEmbeddingService` mid-seed)
 * scores a neutral 0.5 rather than 0, matching the effectiveness signal's
 * "unknown isn't penalized" convention.
 */
export function semanticSimilaritySignal(context: SignalContext): number {
  if (context.semanticDistance === null) return 0.5;
  return clamp01(1 - context.semanticDistance / 2);
}
