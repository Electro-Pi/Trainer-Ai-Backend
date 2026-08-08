import type { ContentItem, ContentStatus, ContentType, Language } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';
import { getCurrentOrganizationId } from '@/database/tenant-context.js';

export type { ContentItem, ContentType };

export interface CoverageGapRow {
  outcomeId: string;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
  levelId: string;
  trackId: string;
}

export interface FullTextSearchRow {
  contentItemId: string;
  title: string;
  contentType: string;
  language: string;
  rank: number;
  snippet: string;
}

export interface FullTextSearchParams {
  query: string;
  language?: 'EN' | 'AR' | undefined;
  trackId?: string | undefined;
  levelId?: string | undefined;
  limit: number;
}

type ContentItemDelegate = typeof prisma.contentItem;

export class ContentItemRepository extends BaseRepository<ContentItem, ContentItemDelegate> {
  constructor() {
    super(prisma.contentItem, 'createdAt');
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request/job-supplied id. */
  async findByIdScoped(id: string): Promise<ContentItem | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /** The recommendation candidate-pool query (ARCHITECTURE §5.4, §8.1). */
  async findCandidates(params: {
    trackId: string;
    levelId: string;
    language: Language;
    status?: ContentStatus;
  }): Promise<ContentItem[]> {
    return this.delegate.findMany({
      where: {
        trackId: params.trackId,
        levelId: params.levelId,
        language: params.language,
        status: params.status ?? 'PUBLISHED',
      },
    });
  }

  /**
   * `CM-13` — every enabled outcome, in this org, with zero `PUBLISHED`
   * content bound to it. Raw SQL carries an explicit `organizationId`
   * predicate (AGENTS rule 8) since the tenant extension only auto-scopes
   * the Prisma query builder, not `$queryRaw`.
   */
  async findCoverageGaps(): Promise<CoverageGapRow[]> {
    const organizationId = getCurrentOrganizationId();
    if (!organizationId) {
      throw new Error('findCoverageGaps() called outside runWithTenant()');
    }

    return prisma.$queryRaw<CoverageGapRow[]>`
      SELECT o."id" AS "outcomeId",
             o."titleEn" AS "outcomeTitleEn",
             o."titleAr" AS "outcomeTitleAr",
             l."id" AS "levelId",
             t."id" AS "trackId"
      FROM "outcomes" o
      JOIN "levels" l ON l."id" = o."levelId"
      JOIN "tracks" t ON t."id" = l."trackId"
      WHERE t."organizationId" = ${organizationId}
        AND o."isEnabled" = true
        AND l."isEnabled" = true
        AND t."isEnabled" = true
        AND NOT EXISTS (
          SELECT 1 FROM "content_outcomes" co
          JOIN "content_items" ci ON ci."id" = co."contentItemId"
          WHERE co."outcomeId" = o."id" AND ci."status" = 'PUBLISHED'
        )
      ORDER BY t."sortOrder", l."order", o."order"
    `;
  }

  /**
   * `content.search` hybrid retrieval's full-text half (D-08) — Postgres FTS
   * with the `arabic`/`english` config chosen per row's own `language`
   * column, never a single global config. Raw SQL carries an explicit
   * `organizationId` predicate (AGENTS rule 8).
   */
  async fullTextSearch(
    organizationId: string,
    params: FullTextSearchParams,
  ): Promise<FullTextSearchRow[]> {
    const languageFilter = params.language
      ? Prisma.sql`AND ci."language" = ${params.language}::"Language"`
      : Prisma.empty;
    const trackFilter = params.trackId
      ? Prisma.sql`AND ci."trackId" = ${params.trackId}`
      : Prisma.empty;
    const levelFilter = params.levelId
      ? Prisma.sql`AND ci."levelId" = ${params.levelId}`
      : Prisma.empty;

    return prisma.$queryRaw<FullTextSearchRow[]>`
      SELECT ci."id" AS "contentItemId",
             ci."title" AS "title",
             ci."contentType" AS "contentType",
             ci."language" AS "language",
             ts_rank(
               to_tsvector(
                 CASE ci."language" WHEN 'AR' THEN 'arabic' ELSE 'english' END::regconfig,
                 ci."title" || ' ' || coalesce(ci."textBody", '')
               ),
               plainto_tsquery(
                 CASE ci."language" WHEN 'AR' THEN 'arabic' ELSE 'english' END::regconfig,
                 ${params.query}
               )
             ) AS "rank",
             left(coalesce(ci."textBody", ci."title"), 240) AS "snippet"
      FROM "content_items" ci
      WHERE ci."organizationId" = ${organizationId}
        AND ci."status" = 'PUBLISHED'
        ${languageFilter}
        ${trackFilter}
        ${levelFilter}
        AND to_tsvector(
              CASE ci."language" WHEN 'AR' THEN 'arabic' ELSE 'english' END::regconfig,
              ci."title" || ' ' || coalesce(ci."textBody", '')
            ) @@ plainto_tsquery(
              CASE ci."language" WHEN 'AR' THEN 'arabic' ELSE 'english' END::regconfig,
              ${params.query}
            )
      ORDER BY "rank" DESC
      LIMIT ${params.limit}
    `;
  }

  /**
   * Hydrates pgvector match ids into full rows for the semantic half of
   * hybrid search — `PUBLISHED` only, since that's the only status search
   * results may surface. `findMany` IS tenant-scoped by the extension
   * (unlike `findUnique`/`findById`), so no explicit `organizationId` is
   * needed here.
   */
  async findManyByIdsScoped(ids: string[]): Promise<ContentItem[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' } });
  }

  /** Batched existence check for bulk operations (`CM-16`) — any status. */
  async findManyByIdsAnyStatus(ids: string[]): Promise<ContentItem[]> {
    if (ids.length === 0) return [];
    return this.delegate.findMany({ where: { id: { in: ids } } });
  }
}
