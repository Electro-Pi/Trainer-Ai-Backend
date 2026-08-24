import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  CreateDepartmentDto,
  DepartmentResponseDto,
  UpdateDepartmentDto,
} from '../dto/department.dto.js';
import type { Department } from '../repositories/department.repository.js';
import { DepartmentService, type ActingUser } from '../services/department.service.js';

const service = new DepartmentService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(department: Department): DepartmentResponseDto {
  return {
    id: department.id,
    organizationId: department.organizationId,
    nameEn: department.nameEn,
    nameAr: department.nameAr,
    isEnabled: department.isEnabled,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}

export class DepartmentController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, cursor } = req.query as unknown as { limit: number; cursor?: string };
    const page = await service.list(toActingUser(req.auth!), limit, cursor);
    res.status(200).json(
      toCollectionResponse(page.data.map(toResponseDto), {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const department = await service.getById(toActingUser(req.auth!), id);
    res.status(200).json(toResponseDto(department));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateDepartmentDto;
    const department = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toResponseDto(department));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateDepartmentDto;
    const department = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(department));
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
