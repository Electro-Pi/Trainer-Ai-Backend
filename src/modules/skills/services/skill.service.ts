import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';

import type { CreateSkillDto, SkillFilterDto, UpdateSkillDto } from '../dto/skill.dto.js';
import { SkillRepository, type Skill } from '../repositories/skill.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export class SkillService {
  private readonly skills = new SkillRepository();

  async list(filter: SkillFilterDto): Promise<PageResult<Skill>> {
    return this.skills.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      ...(filter.isEnabled !== undefined ? { where: { isEnabled: filter.isEnabled } } : {}),
    });
  }

  async getById(id: string): Promise<Skill> {
    const skill = await this.skills.findByIdScoped(id);
    if (!skill) {
      throw new NotFoundError('Skill not found');
    }
    return skill;
  }

  async create(actor: ActingUser, dto: CreateSkillDto): Promise<Skill> {
    const existing = await this.skills.findByKey(dto.key);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A skill with this key already exists' },
      ]);
    }

    const created = await this.skills.create({
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      category: dto.category,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      targetTracks: dto.targetTracks,
      levels: dto.levels,
      ...(dto.assessmentEnabled !== undefined ? { assessmentEnabled: dto.assessmentEnabled } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'skill.created',
      entityType: 'Skill',
      entityId: created.id,
      after: { key: created.key, nameEn: created.nameEn },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateSkillDto): Promise<Skill> {
    const before = await this.getById(id);

    const updated = await this.skills.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(dto.targetTracks !== undefined ? { targetTracks: dto.targetTracks } : {}),
      ...(dto.levels !== undefined ? { levels: dto.levels } : {}),
      ...(dto.assessmentEnabled !== undefined ? { assessmentEnabled: dto.assessmentEnabled } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'skill.updated',
      entityType: 'Skill',
      entityId: id,
      before: { nameEn: before.nameEn },
      after: { nameEn: updated.nameEn },
    });

    return updated;
  }

  /** Disables without deleting — matches the deactivate/archive-not-delete convention. */
  async setEnabled(actor: ActingUser, id: string, isEnabled: boolean): Promise<Skill> {
    const before = await this.getById(id);

    const updated = await this.skills.update(id, { isEnabled } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: isEnabled ? 'skill.enabled' : 'skill.disabled',
      entityType: 'Skill',
      entityId: id,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: updated.isEnabled },
    });

    return updated;
  }

  async duplicate(actor: ActingUser, id: string, newKey: string): Promise<Skill> {
    await this.getById(id);

    const existing = await this.skills.findByKey(newKey);
    if (existing) {
      throw new ValidationError([
        { path: 'key', code: 'duplicate', message: 'A skill with this key already exists' },
      ]);
    }

    const copy = await this.skills.duplicate(id, newKey);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'skill.duplicated',
      entityType: 'Skill',
      entityId: copy.id,
      after: { sourceId: id, key: copy.key },
    });

    return copy;
  }

  /**
   * `targetTracks`/`Track.targetSkills`/`Outcome.targetSkills` reference
   * skills by name string, not by FK — there is no relation for a hard
   * delete to violate. Unlike Track/Outcome, no "in use" guard is needed
   * here; a stale name left behind on another record is a display-only
   * concern, not a referential-integrity one.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const skill = await this.getById(id);

    await this.skills.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'skill.deleted',
      entityType: 'Skill',
      entityId: id,
      before: { key: skill.key, nameEn: skill.nameEn },
    });
  }
}

export const skillService = new SkillService();
