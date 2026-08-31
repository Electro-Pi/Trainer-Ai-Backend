import type { Request, Response } from 'express';

import { toCollectionResponse } from '@/common/interceptors/response-envelope.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';

import type {
  LearnerExperienceResponseDto,
  LearnerResponseDto,
  PutLearnerExperienceDto,
  UpdateLearnerDto,
} from '../dto/learner.dto.js';
import type { LearnerExperience } from '../repositories/learner-experience.repository.js';
import type { Learner } from '../repositories/learner.repository.js';
import { LearnerService, type ActingUser } from '../services/learner.service.js';

const service = new LearnerService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

export async function toResponseDto(learner: Learner): Promise<LearnerResponseDto> {
  const department = await service.getDepartmentNames(learner.id);
  return {
    id: learner.id,
    organizationId: learner.organizationId,
    teamId: learner.teamId,
    entraObjectId: learner.entraObjectId,
    email: learner.email,
    displayName: learner.displayName,
    jobTitle: learner.jobTitle,
    departmentId: learner.departmentId,
    departmentName: department?.nameEn ?? null,
    departmentNameAr: department ? department.nameAr || department.nameEn : null,
    preferredLanguage: learner.preferredLanguage,
    status: learner.status,
    deactivatedAt: learner.deactivatedAt?.toISOString() ?? null,
    createdAt: learner.createdAt.toISOString(),
  };
}

function toExperienceResponseDto(experience: LearnerExperience): LearnerExperienceResponseDto {
  return {
    id: experience.id,
    learnerId: experience.learnerId,
    background: experience.background,
    yearsOfExperience: experience.yearsOfExperience,
    priorTraining: experience.priorTraining,
    notes: experience.notes,
    recordedById: experience.recordedById,
    createdAt: experience.createdAt.toISOString(),
  };
}

export class LearnerController {
  async list(req: Request, res: Response): Promise<void> {
    const { limit, cursor, teamId } = req.query as unknown as {
      limit: number;
      cursor?: string;
      teamId?: string;
    };
    const page = await service.list(limit, cursor, teamId);
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
    const learner = await service.getById(id);
    res.status(200).json(await toResponseDto(learner));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateLearnerDto;
    const learner = await service.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(await toResponseDto(learner));
  }

  async deactivate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const learner = await service.deactivate(toActingUser(req.auth!), id);
    res.status(200).json(await toResponseDto(learner));
  }

  async getExperience(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const experience = await service.getExperience(id);
    res.status(200).json(experience ? toExperienceResponseDto(experience) : null);
  }

  async putExperience(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as PutLearnerExperienceDto;
    const experience = await service.putExperience(toActingUser(req.auth!), id, dto);
    res.status(200).json(toExperienceResponseDto(experience));
  }
}
