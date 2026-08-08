import { createHash } from 'node:crypto';

import type { EmbeddingService } from '@/shared-types.js';

import { EMBEDDING_DIMENSIONS } from '../interfaces/embedding.interface.js';

/**
 * Deterministic dev/test default (ARCHITECTURE §4.5, D-14) — the same input
 * text always produces the same vector, which is what makes recommendation
 * ranking tests reproducible (P11-5) without an Azure OpenAI dependency.
 * Derives a unit vector from a SHA-256-seeded PRNG rather than random bytes.
 */
export class FakeEmbeddingService implements EmbeddingService {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  embed(text: string): Promise<number[]> {
    const seed = createHash('sha256').update(text).digest();

    let state = seed.readUInt32LE(0) || 1;
    const next = (): number => {
      // xorshift32 — fast, deterministic, good enough spread for a fake vector.
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0xffffffff;
    };

    const raw = Array.from({ length: this.dimensions }, () => next() * 2 - 1);
    const magnitude = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0)) || 1;
    return Promise.resolve(raw.map((value) => value / magnitude));
  }
}
