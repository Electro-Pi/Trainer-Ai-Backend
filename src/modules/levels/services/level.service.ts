import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';

import type { CreateLevelDto, UpdateLevelDto } from '../dto/level.dto.js';
import { LevelRepository, type Level } from '../repositories/level.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `levels` module — P4-2. Levels are defined per track, never global (`TC-02`, `LV-02`). */
export class LevelService {
  private readonly levels = new LevelRepository();

  async listByTrack(trackId: string): Promise<Level[]> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new NotFoundError('Track not found');
    }
    return this.levels.findByTrack(trackId);
  }

  async getById(id: string): Promise<Level> {
    const level = await this.levels.findByIdScoped(id);
    if (!level) {
      throw new NotFoundError('Level not found');
    }
    return level;
  }

  async create(actor: ActingUser, trackId: string, dto: CreateLevelDto): Promise<Level> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new NotFoundError('Track not found');
    }

    const existing = await this.levels.findByTrackAndKey(trackId, dto.key);
    if (existing) {
      throw new ValidationError([
        {
          path: 'key',
          code: 'duplicate',
          message: 'A level with this key already exists on this track',
        },
      ]);
    }

    const siblings = await this.levels.findByTrack(trackId);

    const created = await this.levels.create({
      trackId,
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      // Max + 1, not a count — `@@unique([trackId, order])` makes a count
      // collide once a deleted level leaves a gap in the sequence. Same
      // reasoning as `OutcomeService.create`.
      order: siblings.reduce((max, l) => Math.max(max, l.order + 1), 0),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'level.created',
      entityType: 'Level',
      entityId: created.id,
      after: { trackId, key: created.key },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateLevelDto): Promise<Level> {
    const before = await this.getById(id);

    const updated = await this.levels.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'level.updated',
      entityType: 'Level',
      entityId: id,
      before: { nameEn: before.nameEn },
      after: { nameEn: updated.nameEn },
    });

    return updated;
  }

  /** `TC-06`-equivalent for levels — disables without deleting outcomes or history. */
  async setEnabled(actor: ActingUser, id: string, isEnabled: boolean): Promise<Level> {
    const before = await this.getById(id);

    const updated = await this.levels.update(id, { isEnabled } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: isEnabled ? 'level.enabled' : 'level.disabled',
      entityType: 'Level',
      entityId: id,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: updated.isEnabled },
    });

    return updated;
  }

  /**
   * Hard delete — only permitted while the level is still empty (no
   * outcomes, content, plan templates, or a learner ever assigned to it).
   * Anything with real training data attached must be archived
   * (`setEnabled(false)`) instead, never deleted — mirrors `TrackService.delete`.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const level = await this.getById(id);

    if (await this.levels.hasChildren(id)) {
      throw new ValidationError([
        {
          path: 'id',
          code: 'has_children',
          message:
            'This level has outcomes, content, plan templates, or an assigned learner and can’t be deleted. Archive it instead.',
        },
      ]);
    }

    await this.levels.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'level.deleted',
      entityType: 'Level',
      entityId: id,
      before: { key: level.key, nameEn: level.nameEn },
    });
  }

  /** `P4-6` — reorders levels within one track; rejects an `order` that doesn't exactly match the track's current level set. */
  async reorder(actor: ActingUser, trackId: string, order: string[]): Promise<void> {
    const track = await trackRepository.findByIdScoped(trackId);
    if (!track) {
      throw new NotFoundError('Track not found');
    }

    const siblings = await this.levels.findByTrack(trackId);
    const siblingIds = new Set(siblings.map((level) => level.id));

    if (order.length !== siblings.length || !order.every((id) => siblingIds.has(id))) {
      throw new ValidationError([
        {
          path: 'order',
          code: 'invalid',
          message: 'order must contain exactly the levels currently on this track',
        },
      ]);
    }

    await this.levels.reorder(order);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'level.reordered',
      entityType: 'Track',
      entityId: trackId,
      after: { order },
    });
  }
}
