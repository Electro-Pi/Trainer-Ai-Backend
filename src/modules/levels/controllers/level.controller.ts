import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type { CreateLevelDto, LevelResponseDto, UpdateLevelDto } from '../dto/level.dto.js';
import type { Level } from '../repositories/level.repository.js';
import { LevelService, type ActingUser } from '../services/level.service.js';

const service = new LevelService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(level: Level): LevelResponseDto {
  return {
    id: level.id,
    trackId: level.trackId,
    key: level.key,
    nameEn: level.nameEn,
    nameAr: level.nameAr,
    descriptionEn: level.descriptionEn,
    descriptionAr: level.descriptionAr,
    order: level.order,
    isEnabled: level.isEnabled,
    createdAt: level.createdAt.toISOString(),
    updatedAt: level.updatedAt.toISOString(),
  };
}

export class LevelController {
  async listByTrack(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params as { trackId: string };
    const levels = await service.listByTrack(trackId);
    res.status(200).json({ data: levels.map(toResponseDto) });
  }

  async create(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params as { trackId: string };
    const dto = req.body as CreateLevelDto;
    const level = await service.create(toActingUser(req.auth!), trackId, dto);
    res.status(201).json(toResponseDto(level));
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const level = await service.getById(id);
    res.status(200).json(toResponseDto(level));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateLevelDto;
    const level = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(level));
  }

  async setEnabled(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const level = await service.setEnabled(toActingUser(req.auth!), id, isEnabled);
    res.status(200).json(toResponseDto(level));
  }

  async reorder(req: Request, res: Response): Promise<void> {
    const { trackId } = req.params as { trackId: string };
    const { order } = req.body as { order: string[] };
    await service.reorder(toActingUser(req.auth!), trackId, order);
    res.status(200).json({ order });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
