import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type { CreateOutcomeDto, OutcomeResponseDto, UpdateOutcomeDto } from '../dto/outcome.dto.js';
import type { Outcome } from '../repositories/outcome.repository.js';
import { OutcomeService, type ActingUser } from '../services/outcome.service.js';

const service = new OutcomeService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(outcome: Outcome): OutcomeResponseDto {
  return {
    id: outcome.id,
    levelId: outcome.levelId,
    skillId: outcome.skillId,
    titleEn: outcome.titleEn,
    titleAr: outcome.titleAr,
    descriptionEn: outcome.descriptionEn,
    descriptionAr: outcome.descriptionAr,
    targetSkills: outcome.targetSkills,
    trainingForm: outcome.trainingForm,
    order: outcome.order,
    isEnabled: outcome.isEnabled,
    createdAt: outcome.createdAt.toISOString(),
    updatedAt: outcome.updatedAt.toISOString(),
  };
}

export class OutcomeController {
  async listByLevel(req: Request, res: Response): Promise<void> {
    const { levelId } = req.params as { levelId: string };
    const outcomes = await service.listByLevel(levelId);
    res.status(200).json({ data: outcomes.map(toResponseDto) });
  }

  async create(req: Request, res: Response): Promise<void> {
    const { levelId } = req.params as { levelId: string };
    const dto = req.body as CreateOutcomeDto;
    const outcome = await service.create(toActingUser(req.auth!), levelId, dto);
    res.status(201).json(toResponseDto(outcome));
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const outcome = await service.getById(id);
    res.status(200).json(toResponseDto(outcome));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateOutcomeDto;
    const outcome = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(toResponseDto(outcome));
  }

  async setEnabled(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { isEnabled } = req.body as { isEnabled: boolean };
    const outcome = await service.setEnabled(toActingUser(req.auth!), id, isEnabled);
    res.status(200).json(toResponseDto(outcome));
  }

  async reorder(req: Request, res: Response): Promise<void> {
    const { levelId } = req.params as { levelId: string };
    const { order } = req.body as { order: string[] };
    await service.reorder(toActingUser(req.auth!), levelId, order);
    res.status(200).json({ order });
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.delete(toActingUser(req.auth!), id);
    res.status(204).send();
  }

  async duplicate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const outcome = await service.duplicate(toActingUser(req.auth!), id);
    res.status(201).json(toResponseDto(outcome));
  }
}
