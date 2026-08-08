import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';

import type { CreateTrackDto, TrackFilterDto, UpdateTrackDto } from '../dto/track.dto.js';
import { TrackRepository, type Track } from '../repositories/track.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `tracks` module — P4-1, P4-4, P4-5, P4-6. */
export class TrackService {
  private readonly tracks = new TrackRepository();

  async list(filter: TrackFilterDto): Promise<PageResult<Track>> {
    return this.tracks.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      ...(filter.isEnabled !== undefined ? { where: { isEnabled: filter.isEnabled } } : {}),
    });
  }

  async getById(id: string): Promise<Track> {
    const track = await this.tracks.findByIdScoped(id);
    if (!track) {
      throw new NotFoundError('Track not found');
    }
    return track;
  }

  async create(actor: ActingUser, dto: CreateTrackDto): Promise<Track> {
    const existing = await this.tracks.findByKey(dto.key);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A track with this key already exists' },
      ]);
    }

    const created = await this.tracks.create({
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      department: dto.department,
      targetSkills: dto.targetSkills,
      trainingForm: dto.trainingForm,
      impactIndicators: dto.impactIndicators,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.created',
      entityType: 'Track',
      entityId: created.id,
      after: { key: created.key, nameEn: created.nameEn },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateTrackDto): Promise<Track> {
    const before = await this.getById(id);

    const updated = await this.tracks.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(dto.department !== undefined ? { department: dto.department } : {}),
      ...(dto.targetSkills !== undefined ? { targetSkills: dto.targetSkills } : {}),
      ...(dto.trainingForm !== undefined ? { trainingForm: dto.trainingForm } : {}),
      ...(dto.impactIndicators !== undefined ? { impactIndicators: dto.impactIndicators } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.updated',
      entityType: 'Track',
      entityId: id,
      before: { nameEn: before.nameEn },
      after: { nameEn: updated.nameEn },
    });

    return updated;
  }

  /** `TC-06` — enable/disable never deletes; a disabled track drops out of recommendation/assignment eligibility (both check `isEnabled`) but keeps its history. */
  async setEnabled(actor: ActingUser, id: string, isEnabled: boolean): Promise<Track> {
    const before = await this.getById(id);

    const updated = await this.tracks.update(id, { isEnabled } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: isEnabled ? 'track.enabled' : 'track.disabled',
      entityType: 'Track',
      entityId: id,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: updated.isEnabled },
    });

    return updated;
  }

  /** `TC-07` — deep copy of levels + outcomes; the copy starts disabled so it can be reviewed before going live. */
  async duplicate(actor: ActingUser, id: string, newKey: string): Promise<Track> {
    await this.getById(id);

    const existing = await this.tracks.findByKey(newKey);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A track with this key already exists' },
      ]);
    }

    const copy = await this.tracks.duplicate(id, newKey);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.duplicated',
      entityType: 'Track',
      entityId: copy.id,
      after: { sourceId: id, key: copy.key },
    });

    return copy;
  }

  /** `P4-6` — transactional full reorder; every id in `order` must belong to the caller's org. */
  async reorder(actor: ActingUser, order: string[]): Promise<void> {
    for (const id of order) {
      const track = await this.tracks.findByIdScoped(id);
      if (!track) {
        throw new ValidationError([
          { path: 'order', code: 'invalid', message: `Track ${id} not found in this organization` },
        ]);
      }
    }

    await this.tracks.reorder(order);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.reordered',
      entityType: 'Track',
      entityId: order[0] ?? 'n/a',
      after: { order },
    });
  }
}
