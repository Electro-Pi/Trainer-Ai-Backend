import { getCurrentOrganizationId } from '@/database/tenant-context.js';
import { ContentItemRepository } from '@/modules/content/repositories/content-item.repository.js';
import type { FullTextSearchRow } from '@/modules/content/repositories/content-item.repository.js';

import { VectorService } from './vector.service.js';

export interface HybridSearchParams {
  query: string;
  language?: 'EN' | 'AR' | undefined;
  trackId?: string | undefined;
  levelId?: string | undefined;
  limit?: number;
}

export interface HybridSearchResult {
  contentItemId: string;
  title: string;
  contentType: string;
  language: string;
  matchType: 'FULL_TEXT' | 'SEMANTIC';
  score: number;
  snippet: string;
}

/**
 * Hybrid retrieval (`content.search`, ARCHITECTURE D-07/D-08) — Postgres FTS
 * (`arabic`/`english` `to_tsvector` configs, chosen per row's own `language`
 * column, D-08) plus pgvector cosine similarity over `ContentChunk`,
 * deduplicated by content item and merged by normalized score. FTS and
 * vector distance are on different scales, so each is min-max normalized to
 * [0,1] within its own result set before merging — comparing raw `ts_rank`
 * against raw cosine distance directly would be meaningless.
 */
export class RagService {
  private readonly contentItems = new ContentItemRepository();
  private readonly vector = new VectorService();

  async hybridSearch(params: HybridSearchParams): Promise<HybridSearchResult[]> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('hybridSearch() called outside runWithTenant()');
    }

    const limit = params.limit ?? 10;

    const [ftsRows, semanticMatches] = await Promise.all([
      this.contentItems.fullTextSearch(organizationId, { ...params, limit }),
      this.vector.embedAndFindNearest(params.query, { limit }),
    ]);

    const ftsResults: HybridSearchResult[] = normalizeByRank(ftsRows).map((row) => ({
      contentItemId: row.contentItemId,
      title: row.title,
      contentType: row.contentType,
      language: row.language,
      matchType: 'FULL_TEXT' as const,
      score: row.normalizedScore,
      snippet: row.snippet,
    }));

    const semanticItems = await this.contentItems.findManyByIdsScoped(
      semanticMatches.map((m) => m.contentItemId),
    );
    const itemById = new Map(semanticItems.map((item) => [item.id, item]));

    const maxDistance = Math.max(...semanticMatches.map((m) => m.distance), 0.0001);
    const semanticResults: HybridSearchResult[] = semanticMatches
      .filter((m) => itemById.has(m.contentItemId))
      .map((match) => {
        const item = itemById.get(match.contentItemId)!;
        return {
          contentItemId: item.id,
          title: item.title,
          contentType: item.contentType,
          language: item.language,
          matchType: 'SEMANTIC' as const,
          score: 1 - match.distance / maxDistance,
          snippet: match.text.slice(0, 240),
        };
      });

    const merged = new Map<string, HybridSearchResult>();
    for (const result of [...ftsResults, ...semanticResults]) {
      const existing = merged.get(result.contentItemId);
      if (!existing || result.score > existing.score) {
        merged.set(result.contentItemId, result);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

function normalizeByRank(
  rows: FullTextSearchRow[],
): (FullTextSearchRow & { normalizedScore: number })[] {
  const maxRank = Math.max(...rows.map((r) => r.rank), 0.0001);
  return rows.map((row) => ({ ...row, normalizedScore: row.rank / maxRank }));
}
