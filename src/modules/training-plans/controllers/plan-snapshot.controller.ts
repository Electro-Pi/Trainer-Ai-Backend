import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  AddPlanContentSnapshotDto,
  AddPlanOutcomeSnapshotDto,
  AddPlanSkillSnapshotDto,
  PlanContentSnapshotResponseDto,
  PlanOutcomeSnapshotResponseDto,
  PlanSkillSnapshotResponseDto,
  PlanTrackSnapshotResponseDto,
  UpdatePlanContentSnapshotDto,
  UpdatePlanOutcomeSnapshotDto,
  UpdatePlanSkillSnapshotDto,
} from '../dto/plan-snapshot.dto.js';
import type {
  PlanContentSnapshot,
  PlanOutcomeSnapshot,
  PlanSkillSnapshot,
  PlanTrackSnapshotTree,
} from '../repositories/plan-track-snapshot.repository.js';
import { type ActingUser, PlanSnapshotService } from '../services/plan-snapshot.service.js';

const service = new PlanSnapshotService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toContentDto(content: PlanContentSnapshot): PlanContentSnapshotResponseDto {
  return {
    id: content.id,
    sourceContentId: content.sourceContentId,
    title: content.title,
    contentType: content.contentType,
    sourceUrl: content.sourceUrl,
    textBody: content.textBody,
    isRemoved: content.isRemoved,
  };
}

function toOutcomeDto(
  outcome: PlanOutcomeSnapshot & {
    progress?: {
      status: string;
      attemptCount: number;
      lastScore: number | null;
      achievedAt: Date | null;
    } | null;
  },
): PlanOutcomeSnapshotResponseDto {
  return {
    id: outcome.id,
    sourceOutcomeId: outcome.sourceOutcomeId,
    titleEn: outcome.titleEn,
    titleAr: outcome.titleAr,
    descriptionEn: outcome.descriptionEn,
    descriptionAr: outcome.descriptionAr,
    order: outcome.order,
    isRemoved: outcome.isRemoved,
    progress: outcome.progress
      ? {
          status: outcome.progress.status,
          attemptCount: outcome.progress.attemptCount,
          lastScore: outcome.progress.lastScore,
          achievedAt: outcome.progress.achievedAt?.toISOString() ?? null,
        }
      : null,
  };
}

function toSkillDto(
  skill: PlanSkillSnapshot & { outcomes?: Parameters<typeof toOutcomeDto>[0][] },
): PlanSkillSnapshotResponseDto {
  return {
    id: skill.id,
    sourceSkillId: skill.sourceSkillId,
    nameEn: skill.nameEn,
    nameAr: skill.nameAr,
    levels: skill.levels,
    isRemoved: skill.isRemoved,
    outcomes: (skill.outcomes ?? []).map(toOutcomeDto),
  };
}

function toTreeDto(tree: PlanTrackSnapshotTree): PlanTrackSnapshotResponseDto {
  return {
    id: tree.id,
    trainingPlanId: tree.trainingPlanId,
    sourceTrackId: tree.sourceTrackId,
    nameEn: tree.nameEn,
    nameAr: tree.nameAr,
    descriptionEn: tree.descriptionEn,
    descriptionAr: tree.descriptionAr,
    skills: tree.skills.map(toSkillDto),
    content: tree.content.map(toContentDto),
  };
}

export class PlanSnapshotController {
  async create(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const tree = await service.createFromMasterTrack(toActingUser(req.auth!), id);
    res.status(201).json(toTreeDto(tree));
  }

  async getTree(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const tree = await service.getTree(id);
    res.status(200).json(toTreeDto(tree));
  }

  async addSkill(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as AddPlanSkillSnapshotDto;
    const created = await service.addSkill(toActingUser(req.auth!), id, dto);
    res.status(201).json(toSkillDto(created));
  }

  async updateSkill(req: Request, res: Response): Promise<void> {
    const { id, skillSnapshotId } = req.params as { id: string; skillSnapshotId: string };
    const dto = req.body as UpdatePlanSkillSnapshotDto;
    const updated = await service.updateSkill(toActingUser(req.auth!), id, skillSnapshotId, dto);
    res.status(200).json(toSkillDto(updated));
  }

  async removeSkill(req: Request, res: Response): Promise<void> {
    const { id, skillSnapshotId } = req.params as { id: string; skillSnapshotId: string };
    await service.removeSkill(toActingUser(req.auth!), id, skillSnapshotId);
    res.status(204).send();
  }

  async addOutcome(req: Request, res: Response): Promise<void> {
    const { id, skillSnapshotId } = req.params as { id: string; skillSnapshotId: string };
    const dto = req.body as AddPlanOutcomeSnapshotDto;
    const created = await service.addOutcome(toActingUser(req.auth!), id, skillSnapshotId, dto);
    res.status(201).json(toOutcomeDto(created));
  }

  async updateOutcome(req: Request, res: Response): Promise<void> {
    const { id, outcomeSnapshotId } = req.params as { id: string; outcomeSnapshotId: string };
    const dto = req.body as UpdatePlanOutcomeSnapshotDto;
    const updated = await service.updateOutcome(
      toActingUser(req.auth!),
      id,
      outcomeSnapshotId,
      dto,
    );
    res.status(200).json(toOutcomeDto(updated));
  }

  async removeOutcome(req: Request, res: Response): Promise<void> {
    const { id, outcomeSnapshotId } = req.params as { id: string; outcomeSnapshotId: string };
    await service.removeOutcome(toActingUser(req.auth!), id, outcomeSnapshotId);
    res.status(204).send();
  }

  async addContent(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as AddPlanContentSnapshotDto;
    const created = await service.addContent(toActingUser(req.auth!), id, {
      title: dto.title,
      contentType: dto.contentType,
      sourceUrl: dto.sourceUrl ?? null,
      textBody: dto.textBody ?? null,
    });
    res.status(201).json(toContentDto(created));
  }

  async updateContent(req: Request, res: Response): Promise<void> {
    const { id, contentSnapshotId } = req.params as { id: string; contentSnapshotId: string };
    const dto = req.body as UpdatePlanContentSnapshotDto;
    const updated = await service.updateContent(
      toActingUser(req.auth!),
      id,
      contentSnapshotId,
      dto,
    );
    res.status(200).json(toContentDto(updated));
  }

  async removeContent(req: Request, res: Response): Promise<void> {
    const { id, contentSnapshotId } = req.params as { id: string; contentSnapshotId: string };
    await service.removeContent(toActingUser(req.auth!), id, contentSnapshotId);
    res.status(204).send();
  }
}
