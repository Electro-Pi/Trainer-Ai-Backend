import type { Request, Response } from 'express';

import { RagService } from '@/ai/rag.service.js';
import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  BulkCreateContentDto,
  BulkMetadataEditDto,
  ContentFilterDto,
  ContentResponseDto,
  ContentSearchResultDto,
  CreateContentDto,
  UpdateContentDto,
} from '../dto/content.dto.js';
import {
  ContentService,
  type ActingUser,
  type ContentWithOutcomes,
} from '../services/content.service.js';

const service = new ContentService();
const ragService = new RagService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

export function toContentResponseDto({
  item,
  outcomeIds,
}: ContentWithOutcomes): ContentResponseDto {
  return {
    id: item.id,
    organizationId: item.organizationId,
    title: item.title,
    trackId: item.trackId,
    levelId: item.levelId,
    contentType: item.contentType,
    textBody: item.textBody,
    sourceUrl: item.sourceUrl,
    language: item.language,
    status: item.status,
    version: item.version,
    parentVersionId: item.parentVersionId,
    skillTags: item.skillTags,
    outcomeIds,
    createdById: item.createdById,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export class ContentController {
  async list(req: Request, res: Response): Promise<void> {
    const filter = req.query as unknown as ContentFilterDto;
    const page = await service.list(filter);
    const withOutcomes = await service.attachOutcomeIds(page.data);
    res.status(200).json(
      toCollectionResponse(withOutcomes.map(toContentResponseDto), {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await service.getById(id);
    res.status(200).json(toContentResponseDto(result));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateContentDto;
    const result = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toContentResponseDto(result));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateContentDto;
    const result = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toContentResponseDto(result));
  }

  async submitForReview(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const item = await service.submitForReview(toActingUser(req.auth!), id);
    res.status(200).json(toContentResponseDto(await service.getById(item.id)));
  }

  async publish(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const item = await service.publish(toActingUser(req.auth!), id);
    res.status(200).json(toContentResponseDto(await service.getById(item.id)));
  }

  async archive(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const item = await service.archive(toActingUser(req.auth!), id);
    res.status(200).json(toContentResponseDto(await service.getById(item.id)));
  }

  async newVersion(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const result = await service.newVersion(toActingUser(req.auth!), id);
    res.status(201).json(toContentResponseDto(result));
  }

  async bulkCreate(req: Request, res: Response): Promise<void> {
    const dto = req.body as BulkCreateContentDto;
    const results = await service.bulkCreate(toActingUser(req.auth!), dto);
    res.status(201).json({ data: results.map(toContentResponseDto) });
  }

  async bulkMetadataEdit(req: Request, res: Response): Promise<void> {
    const dto = req.body as BulkMetadataEditDto;
    const items = await service.bulkMetadataEdit(toActingUser(req.auth!), dto);
    const withOutcomes = await service.attachOutcomeIds(items);
    res.status(200).json({ data: withOutcomes.map(toContentResponseDto) });
  }

  async coverage(_req: Request, res: Response): Promise<void> {
    const gaps = await service.getCoverageGaps();
    res.status(200).json({ data: gaps });
  }

  async search(req: Request, res: Response): Promise<void> {
    const { q, language, trackId, levelId, limit } = req.query as unknown as {
      q: string;
      language?: 'EN' | 'AR';
      trackId?: string;
      levelId?: string;
      limit: number;
    };
    const results = await ragService.hybridSearch({ query: q, language, trackId, levelId, limit });
    const dto: ContentSearchResultDto[] = results;
    res.status(200).json({ data: dto });
  }
}
