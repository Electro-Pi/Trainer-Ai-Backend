import { AzureOpenAI } from 'openai';

import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import type { EmbeddingService } from '@/shared-types.js';

import { EMBEDDING_DIMENSIONS } from './interfaces/embedding.interface.js';

/**
 * Real implementation (ARCHITECTURE §4.5, `CM-09`) — Azure OpenAI's
 * `text-embedding-3-small` (1536 dimensions), matching `ContentChunk.embedding
 * vector(1536)` (P1-2). Ours, not the AI team's — semantic similarity is one
 * of the six recommendation signals (MEMORY D-15).
 */
export class AzureEmbeddingService implements EmbeddingService {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly client = new AzureOpenAI({
    apiKey: env.AZURE_OPENAI_API_KEY,
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-10-21',
    deployment: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  });

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      input: text,
      dimensions: this.dimensions,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new ExternalServiceError('Azure OpenAI returned no embedding');
    }
    return embedding;
  }
}
