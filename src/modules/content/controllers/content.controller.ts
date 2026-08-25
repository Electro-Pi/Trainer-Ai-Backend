import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  ContentFilterDto,
  ContentResponseDto,
  CreateContentDto,
  UpdateContentDto,
} from '../dto/content.dto.js';
import type { ContentItem } from '../repositories/content-item.repository.js';
import { ContentService, type ActingUser } from '../services/content.service.js';

const service = new ContentService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

export function toContentResponseDto(item: ContentItem): ContentResponseDto {
  return {
    id: item.id,
    organizationId: item.organizationId,
    skillId: item.skillId,
    name: item.name,
    createdById: item.createdById,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export class ContentController {
  async list(req: Request, res: Response): Promise<void> {
    const filter = req.query as unknown as ContentFilterDto;
    const page = await service.list(filter);
    res.status(200).json(
      toCollectionResponse(page.data.map(toContentResponseDto), {
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

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
