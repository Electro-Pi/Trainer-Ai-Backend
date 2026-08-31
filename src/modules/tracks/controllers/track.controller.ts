import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  CreateFullTrackDto,
  CreateTrackDto,
  TrackFilterDto,
  TrackResponseDto,
  UpdateTrackDto,
} from '../dto/track.dto.js';
import type { Track } from '../repositories/track.repository.js';
import { TrackService, type ActingUser } from '../services/track.service.js';

const service = new TrackService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

async function toResponseDto(track: Track): Promise<TrackResponseDto> {
  const department = await service.getDepartmentNames(track.id);
  return {
    id: track.id,
    organizationId: track.organizationId,
    key: track.key,
    nameEn: track.nameEn,
    nameAr: track.nameAr,
    descriptionEn: track.descriptionEn,
    descriptionAr: track.descriptionAr,
    departmentId: track.departmentId,
    departmentName: department?.nameEn ?? '',
    departmentNameAr: department ? department.nameAr || department.nameEn : '',
    targetSkills: track.targetSkills,
    trainingForm: track.trainingForm,
    impactIndicators: track.impactIndicators,
    isEnabled: track.isEnabled,
    sortOrder: track.sortOrder,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  };
}

export class TrackController {
  async list(req: Request, res: Response): Promise<void> {
    const filter = req.query as unknown as TrackFilterDto;
    const page = await service.list(toActingUser(req.auth!), filter);
    const data = await Promise.all(page.data.map(toResponseDto));
    res.status(200).json(
      toCollectionResponse(data, {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const track = await service.getById(id);
    res.status(200).json(await toResponseDto(track));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateTrackDto;
    const track = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(await toResponseDto(track));
  }

  async createFull(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateFullTrackDto;
    const result = await service.createFull(toActingUser(req.auth!), dto);
    res.status(201).json(result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateTrackDto;
    const track = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(await toResponseDto(track));
  }

  async setEnabled(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const track = await service.setEnabled(toActingUser(req.auth!), id, isEnabled);
    res.status(200).json(await toResponseDto(track));
  }

  async duplicate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { key } = req.body as { key: string };
    const track = await service.duplicate(toActingUser(req.auth!), id, key);
    res.status(201).json(await toResponseDto(track));
  }

  async reorder(req: Request, res: Response): Promise<void> {
    const { order } = req.body as { order: string[] };
    await service.reorder(toActingUser(req.auth!), order);
    res.status(200).json({ order });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
