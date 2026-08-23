import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';
import { levelRepository } from '@/modules/levels/levels.module.js';

import type { CreateSkillDto, SkillFilterDto, UpdateSkillDto } from '../dto/skill.dto.js';
import { SkillRepository, type Skill } from '../repositories/skill.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

export class SkillService {
  private readonly skills = new SkillRepository();

  /**
   * `levelId` is optional (nullable through the migration window — same
   * nullable-then-manual-resolution pattern `Outcome.skillId` uses), but when
   * provided it must resolve inside the caller's own org — never trust a
   * request-supplied id without `findByIdScoped` (same defensive-FK-check
   * pattern `OutcomeService.validateSkill` uses for `skillId`).
   */
  private async validateLevel(levelId: string): Promise<void> {
    const level = await levelRepository.findByIdScoped(levelId);
    if (!level) {
      throw new ValidationError([{ path: 'levelId', code: 'invalid', message: 'Level not found' }]);
    }
  }

  async list(filter: SkillFilterDto): Promise<PageResult<Skill>> {
    return this.skills.findMany({
      ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      ...(filter.isEnabled !== undefined ? { where: { isEnabled: filter.isEnabled } } : {}),
    });
  }

  /** A level's skills — populates the level-scoped `GET /levels/:levelId/skills`. */
  async listByLevel(levelId: string): Promise<Skill[]> {
    const level = await levelRepository.findByIdScoped(levelId);
    if (!level) {
      throw new NotFoundError('Level not found');
    }
    return this.skills.findByLevel(levelId);
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

    if (dto.levelId !== undefined) {
      await this.validateLevel(dto.levelId);
    }

    const created = await this.skills.create({
      key: dto.key,
      nameEn: dto.nameEn,
      nameAr: dto.nameAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      levels: dto.levels,
      ...(dto.assessmentEnabled !== undefined ? { assessmentEnabled: dto.assessmentEnabled } : {}),
      ...(dto.levelId !== undefined ? { levelId: dto.levelId } : {}),
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

  /** Creates a skill directly on a level (`POST /levels/:levelId/skills`) — mirrors `OutcomeService.create`. */
  async createOnLevel(
    actor: ActingUser,
    levelId: string,
    dto: Omit<CreateSkillDto, 'levelId'>,
  ): Promise<Skill> {
    await this.validateLevel(levelId);
    return this.create(actor, { ...dto, levelId });
  }

  async update(actor: ActingUser, id: string, dto: UpdateSkillDto): Promise<Skill> {
    const before = await this.getById(id);

    if (dto.levelId !== undefined && dto.levelId !== null) {
      await this.validateLevel(dto.levelId);
    }

    const updated = await this.skills.update(id, {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(dto.levels !== undefined ? { levels: dto.levels } : {}),
      ...(dto.assessmentEnabled !== undefined ? { assessmentEnabled: dto.assessmentEnabled } : {}),
      ...(dto.levelId !== undefined ? { levelId: dto.levelId } : {}),
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
   * `Outcome.skillId` FK's onto this skill — unlike Track/Outcome, no
   * "in use" guard blocks the delete outright; the FK reasoning is documented
   * on `Outcome.skillId` itself (nullable through the migration window).
   * A hard delete here is still safe: nothing cascades, and it matches this
   * service's pre-existing delete-not-archive convention for `Skill`.
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
