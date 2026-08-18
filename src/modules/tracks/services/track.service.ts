import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { departmentRepository } from '@/modules/departments/departments.module.js';

import type {
  CreateFullTrackDto,
  CreateTrackDto,
  FullTrackResponseDto,
  TrackFilterDto,
  UpdateTrackDto,
} from '../dto/track.dto.js';
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

  /** `TrackResponseDto.departmentName` read-through — resolves the readable name behind a track's `departmentId`. */
  async getDepartmentName(trackId: string): Promise<string | null> {
    return this.tracks.findDepartmentName(trackId);
  }

  /**
   * Validates that `departmentId` names an active `Department` in the
   * caller's org before it's written to `Track.departmentId`. `Department`
   * isn't a tenant-scoped model on the Prisma extension (ARCHITECTURE §7.3),
   * so `organizationId` is filtered explicitly here — same reasoning
   * `OrganizationRepository`'s doc comment gives for its own unscoped reads.
   */
  private async resolveDepartmentId(actor: ActingUser, departmentId: string): Promise<string> {
    const department = await departmentRepository.findByIdScoped(
      departmentId,
      actor.organizationId,
    );
    if (!department) {
      throw new ValidationError([
        {
          path: 'departmentId',
          code: 'invalid',
          message: 'departmentId must reference a department in this organization',
        },
      ]);
    }
    return department.id;
  }

  async create(actor: ActingUser, dto: CreateTrackDto): Promise<Track> {
    const existing = await this.tracks.findByKey(dto.key);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A track with this key already exists' },
      ]);
    }

    const departmentId = await this.resolveDepartmentId(actor, dto.departmentId);

    const created = await this.tracks.create({
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      departmentId,
      targetSkills: dto.targetSkills,
      trainingForm: dto.trainingForm,
      impactIndicators: dto.impactIndicators,
      ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
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

    const departmentId =
      dto.departmentId !== undefined
        ? await this.resolveDepartmentId(actor, dto.departmentId)
        : undefined;

    const updated = await this.tracks.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(departmentId !== undefined ? { departmentId } : {}),
      ...(dto.targetSkills !== undefined ? { targetSkills: dto.targetSkills } : {}),
      ...(dto.trainingForm !== undefined ? { trainingForm: dto.trainingForm } : {}),
      ...(dto.impactIndicators !== undefined ? { impactIndicators: dto.impactIndicators } : {}),
      ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
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

  /**
   * Hard delete — only permitted while the track is still empty (no levels,
   * no content, no plan templates). Anything with real training data
   * attached must be archived (`setEnabled(false)`) instead, never deleted.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const track = await this.getById(id);

    if (await this.tracks.hasChildren(id)) {
      throw new ValidationError([
        {
          path: 'id',
          code: 'has_children',
          message:
            'This track has levels, content, or plan templates attached and can’t be deleted. Archive it instead.',
        },
      ]);
    }

    await this.tracks.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.deleted',
      entityType: 'Track',
      entityId: id,
      before: { key: track.key, nameEn: track.nameEn },
    });
  }

  /**
   * Track-creation wizard's Save action — validates `departmentId`, then
   * delegates the actual multi-model transaction to the repository (same
   * layering `duplicate()` above uses: service validates/orchestrates,
   * repository does the raw `tx` work). One audit row is written after the
   * transaction commits, summarizing the whole created tree.
   */
  async createFull(actor: ActingUser, dto: CreateFullTrackDto): Promise<FullTrackResponseDto> {
    const departmentId = await this.resolveDepartmentId(actor, dto.departmentId);

    const result = await this.tracks.createFull({ ...dto, departmentId }, actor.id);

    const skillCount = result.levels.reduce((sum, l) => sum + l.skills.length, 0);
    const outcomeCount = result.levels.reduce(
      (sum, l) => sum + l.skills.reduce((s, sk) => s + sk.outcomes.length, 0),
      0,
    );
    const contentCount = result.levels.reduce(
      (sum, l) => sum + l.skills.reduce((s, sk) => s + sk.content.length, 0),
      0,
    );

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'track.created',
      entityType: 'Track',
      entityId: result.track.id,
      after: {
        key: result.track.key,
        nameEn: result.track.nameEn,
        levelCount: result.levels.length,
        skillCount,
        outcomeCount,
        contentCount,
      },
    });

    return result;
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
