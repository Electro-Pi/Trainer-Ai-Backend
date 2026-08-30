import type { Request, Response } from 'express';

import { ValidationError } from '@/common/exceptions/app-error.js';
import type { AuthContext } from '@/common/types/express.js';
import { logger } from '@/logger/logger.service.js';

import type {
  AddPlanContentSnapshotDto,
  AddPlanOutcomeSnapshotDto,
  AddPlanSkillSnapshotDto,
  PlanContentMediaResponseDto,
  PlanContentSnapshotResponseDto,
  PlanOutcomeSnapshotResponseDto,
  PlanSkillSnapshotResponseDto,
  PlanTrackSnapshotResponseDto,
  UpdatePlanContentSnapshotDto,
  UpdatePlanOutcomeSnapshotDto,
  UpdatePlanSkillSnapshotDto,
} from '../dto/plan-snapshot.dto.js';
import type { PlanContentMedia } from '../repositories/plan-content-media.repository.js';
import type {
  PlanContentSnapshot,
  PlanOutcomeSnapshot,
  PlanSkillSnapshot,
  PlanTrackSnapshotTree,
} from '../repositories/plan-track-snapshot.repository.js';
import { PlanContentMediaService } from '../services/plan-content-media.service.js';
import { type ActingUser, PlanSnapshotService } from '../services/plan-snapshot.service.js';

const service = new PlanSnapshotService();
const mediaService = new PlanContentMediaService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

async function toMediaDto(media: PlanContentMedia): Promise<PlanContentMediaResponseDto> {
  return {
    id: media.id,
    contentSnapshotId: media.contentSnapshotId,
    originalFilename: media.originalFilename,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    scanStatus: media.scanStatus,
    // Minting a signed URL is a second round trip to the storage provider,
    // made after the upload and DB row already succeeded. Letting it throw
    // failed the whole upload request — the caller then retried work that had
    // actually worked. Degrade to null instead; the asset is persisted and
    // any later read can mint a URL again.
    downloadUrl: await mediaService.getDownloadUrl(media.id).catch((err: unknown) => {
      logger.warn(
        { planContentMediaId: media.id, err },
        'Could not mint a download URL for a plan-content asset',
      );
      return null;
    }),
    createdAt: media.createdAt.toISOString(),
  };
}

async function toContentDto(
  content: PlanContentSnapshot & { media?: PlanContentMedia[] },
): Promise<PlanContentSnapshotResponseDto> {
  return {
    id: content.id,
    skillSnapshotId: content.skillSnapshotId,
    sourceContentId: content.sourceContentId,
    title: content.title,
    contentType: content.contentType,
    sourceUrl: content.sourceUrl,
    textBody: content.textBody,
    isRemoved: content.isRemoved,
    media: await Promise.all((content.media ?? []).map(toMediaDto)),
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

async function toSkillDto(
  skill: PlanSkillSnapshot & {
    outcomes?: Parameters<typeof toOutcomeDto>[0][];
    content?: Parameters<typeof toContentDto>[0][];
  },
): Promise<PlanSkillSnapshotResponseDto> {
  return {
    id: skill.id,
    sourceSkillId: skill.sourceSkillId,
    nameEn: skill.nameEn,
    nameAr: skill.nameAr,
    descriptionEn: skill.descriptionEn,
    descriptionAr: skill.descriptionAr,
    levels: skill.levels,
    isRemoved: skill.isRemoved,
    outcomes: (skill.outcomes ?? []).map(toOutcomeDto),
    content: await Promise.all((skill.content ?? []).map(toContentDto)),
  };
}

async function toTreeDto(tree: PlanTrackSnapshotTree): Promise<PlanTrackSnapshotResponseDto> {
  return {
    id: tree.id,
    trainingPlanId: tree.trainingPlanId,
    sourceTrackId: tree.sourceTrackId,
    nameEn: tree.nameEn,
    nameAr: tree.nameAr,
    descriptionEn: tree.descriptionEn,
    descriptionAr: tree.descriptionAr,
    skills: await Promise.all(tree.skills.map(toSkillDto)),
    content: await Promise.all(tree.content.map(toContentDto)),
  };
}

export class PlanSnapshotController {
  async create(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const tree = await service.createFromMasterTrack(toActingUser(req.auth!), id);
    res.status(201).json(await toTreeDto(tree));
  }

  async getTree(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const tree = await service.getTree(id);
    res.status(200).json(await toTreeDto(tree));
  }

  async addSkill(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as AddPlanSkillSnapshotDto;
    const created = await service.addSkill(toActingUser(req.auth!), id, {
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn ?? '',
      descriptionAr: dto.descriptionAr ?? '',
      levels: dto.levels,
    });
    res.status(201).json(await toSkillDto(created));
  }

  async updateSkill(req: Request, res: Response): Promise<void> {
    const { id, skillSnapshotId } = req.params as { id: string; skillSnapshotId: string };
    const dto = req.body as UpdatePlanSkillSnapshotDto;
    const updated = await service.updateSkill(toActingUser(req.auth!), id, skillSnapshotId, dto);
    res.status(200).json(await toSkillDto(updated));
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
      skillSnapshotId: dto.skillSnapshotId ?? null,
      title: dto.title,
      contentType: dto.contentType,
      sourceUrl: dto.sourceUrl ?? null,
      textBody: dto.textBody ?? null,
    });
    res.status(201).json(await toContentDto(created));
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
    res.status(200).json(await toContentDto(updated));
  }

  async removeContent(req: Request, res: Response): Promise<void> {
    const { id, contentSnapshotId } = req.params as { id: string; contentSnapshotId: string };
    await service.removeContent(toActingUser(req.auth!), id, contentSnapshotId);
    res.status(204).send();
  }

  async uploadMedia(req: Request, res: Response): Promise<void> {
    const { id, contentSnapshotId } = req.params as { id: string; contentSnapshotId: string };
    if (!req.file) {
      throw new ValidationError([
        { path: 'file', code: 'required', message: 'A file is required' },
      ]);
    }
    const created = await mediaService.upload(toActingUser(req.auth!), id, contentSnapshotId, {
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
    });
    res.status(201).json(await toMediaDto(created));
  }

  async listMedia(req: Request, res: Response): Promise<void> {
    const { contentSnapshotId } = req.params as { id: string; contentSnapshotId: string };
    const assets = await mediaService.listByContentSnapshot(contentSnapshotId);
    res.status(200).json({ data: await Promise.all(assets.map(toMediaDto)) });
  }
}
