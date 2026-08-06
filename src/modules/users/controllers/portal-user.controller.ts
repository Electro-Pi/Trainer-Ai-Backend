import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  CreatePortalUserDto,
  PortalUserResponseDto,
  UpdatePortalUserDto,
} from '../dto/portal-user.dto.js';
import type { PortalUser } from '../repositories/portal-user.repository.js';
import { PortalUserService, type ActingUser } from '../services/portal-user.service.js';

const service = new PortalUserService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(user: PortalUser): PortalUserResponseDto {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export class PortalUserController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const page = await service.list(limit, cursor);
    res.status(200).json(
      toCollectionResponse(page.data.map(toResponseDto), {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const user = await service.getById(id);
    res.status(200).json(toResponseDto(user));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreatePortalUserDto;
    const user = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toResponseDto(user));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdatePortalUserDto;
    const user = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(user));
  }

  async deactivate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const user = await service.deactivate(toActingUser(req.auth!), id);
    res.status(200).json(toResponseDto(user));
  }
}
