import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  CreateSkillDto,
  SkillFilterDto,
  SkillResponseDto,
  UpdateSkillDto,
} from '../dto/skill.dto.js';
import type { Skill } from '../repositories/skill.repository.js';
import { SkillService, type ActingUser } from '../services/skill.service.js';

const service = new SkillService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(skill: Skill): SkillResponseDto {
  return {
    id: skill.id,
    organizationId: skill.organizationId,
    levelId: skill.levelId,
    key: skill.key,
    nameEn: skill.nameEn,
    nameAr: skill.nameAr,
    descriptionEn: skill.descriptionEn,
    descriptionAr: skill.descriptionAr,
    levels: skill.levels,
    assessmentEnabled: skill.assessmentEnabled,
    isEnabled: skill.isEnabled,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

export class SkillController {
  async list(req: Request, res: Response): Promise<void> {
    const filter = req.query as unknown as SkillFilterDto;
    const page = await service.list(filter);
    const data = page.data.map(toResponseDto);
    res.status(200).json(
      toCollectionResponse(data, {
        nextCursor: page.nextCursor,
        hasNextPage: page.hasNextPage,
      }),
    );
  }

  async listByLevel(req: Request, res: Response): Promise<void> {
    const { levelId } = req.params as { levelId: string };
    const skills = await service.listByLevel(levelId);
    res.status(200).json({ data: skills.map(toResponseDto) });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const skill = await service.getById(id);
    res.status(200).json(toResponseDto(skill));
  }

  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateSkillDto;
    const skill = await service.create(toActingUser(req.auth!), dto);
    res.status(201).json(toResponseDto(skill));
  }

  async createOnLevel(req: Request, res: Response): Promise<void> {
    const { levelId } = req.params as { levelId: string };
    const dto = req.body as Omit<CreateSkillDto, 'levelId'>;
    const skill = await service.createOnLevel(toActingUser(req.auth!), levelId, dto);
    res.status(201).json(toResponseDto(skill));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateSkillDto;
    const skill = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(skill));
  }

  async setEnabled(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const skill = await service.setEnabled(toActingUser(req.auth!), id, isEnabled);
    res.status(200).json(toResponseDto(skill));
  }

  async duplicate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { key } = req.body as { key: string };
    const skill = await service.duplicate(toActingUser(req.auth!), id, key);
    res.status(201).json(toResponseDto(skill));
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }
}
