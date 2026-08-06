-- P1-2: pgvector extension, embedding column, HNSW index.
-- Prisma has no native vector type (ARCHITECTURE §5.2) — raw SQL, not the Prisma schema, owns this.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "content_chunks" ADD COLUMN "embedding" vector(1536);

-- Cosine distance is the recommender's similarity signal (ARCHITECTURE §8.1, weight 0.10).
CREATE INDEX "content_chunks_embedding_hnsw_idx" ON "content_chunks"
  USING hnsw ("embedding" vector_cosine_ops);
