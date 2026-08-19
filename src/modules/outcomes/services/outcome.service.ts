import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { skillRepository } from '@/modules/skills/skills.module.js';

import type { CreateOutcomeDto, UpdateOutcomeDto } from '../dto/outcome.dto.js';
import { OutcomeRepository, type Outcome } from '../repositories/outcome.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `outcomes` module — P4-3. Every level owns a defined outcome set — this linkage drives the whole assignment flow (`TC-03`, `LV-03`). */
export class OutcomeService {
  private readonly outcomes = new OutcomeRepository();

  /**
   * `skillId` is optional through the migration window (new 1:1-from-outcome
   * side rule), but when provided it must resolve inside the caller's own
   * org — never trust a request-supplied id without `findByIdScoped` (same
   * defensive-FK-check pattern as `LearnerAssignmentService.assign`'s
   * `trackId`/`levelId` checks).
   */
  private async validateSkill(skillId: string): Promise<void> {
    const skill = await skillRepository.findByIdScoped(skillId);
    if (!skill) {
      throw new ValidationError([{ path: 'skillId', code: 'invalid', message: 'Skill not found' }]);
    }
  }

  async listByLevel(levelId: string): Promise<Outcome[]> {
    const level = await levelRepository.findByIdScoped(levelId);
    if (!level) {
      throw new NotFoundError('Level not found');
    }
    return this.outcomes.findByLevel(levelId);
  }

  async getById(id: string): Promise<Outcome> {
    const outcome = await this.outcomes.findByIdScoped(id);
    if (!outcome) {
      throw new NotFoundError('Outcome not found');
    }
    return outcome;
  }

  async create(actor: ActingUser, levelId: string, dto: CreateOutcomeDto): Promise<Outcome> {
    const level = await levelRepository.findByIdScoped(levelId);
    if (!level) {
      throw new NotFoundError('Level not found');
    }

    if (dto.skillId !== undefined) {
      await this.validateSkill(dto.skillId);
    }

    const siblings = await this.outcomes.findByLevel(levelId);

    const created = await this.outcomes.create({
      levelId,
      titleEn: dto.titleEn,
      titleAr: dto.titleAr,
      targetSkills: dto.targetSkills,
      order: siblings.length,
      ...(dto.skillId !== undefined ? { skillId: dto.skillId } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'outcome.created',
      entityType: 'Outcome',
      entityId: created.id,
      after: { levelId, titleEn: created.titleEn },
    });

    return created;
  }

  async update(actor: ActingUser, id: string, dto: UpdateOutcomeDto): Promise<Outcome> {
    const before = await this.getById(id);

    if (dto.skillId !== undefined) {
      await this.validateSkill(dto.skillId);
    }

    const updated = await this.outcomes.update(id, {
      ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn } : {}),
      ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
      ...(dto.targetSkills !== undefined ? { targetSkills: dto.targetSkills } : {}),
      ...(dto.skillId !== undefined ? { skillId: dto.skillId } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'outcome.updated',
      entityType: 'Outcome',
      entityId: id,
      before: { titleEn: before.titleEn },
      after: { titleEn: updated.titleEn },
    });

    return updated;
  }

  async duplicate(actor: ActingUser, id: string): Promise<Outcome> {
    await this.getById(id);
    const copy = await this.outcomes.duplicate(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'outcome.duplicated',
      entityType: 'Outcome',
      entityId: copy.id,
      after: { sourceId: id, titleEn: copy.titleEn },
    });

    return copy;
  }

  /** Disables without deleting — `LearnerOutcome` rows already materialized against this outcome are untouched (non-negotiable 17). */
  async setEnabled(actor: ActingUser, id: string, isEnabled: boolean): Promise<Outcome> {
    const before = await this.getById(id);

    const updated = await this.outcomes.update(id, { isEnabled } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: isEnabled ? 'outcome.enabled' : 'outcome.disabled',
      entityType: 'Outcome',
      entityId: id,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: updated.isEnabled },
    });

    return updated;
  }

  /**
   * Hard delete — only permitted while nothing real has attached to this
   * outcome yet (see `OutcomeRepository.hasChildren`). Anything in use must
   * be archived (`setEnabled(false)`) instead.
   */
  async delete(actor: ActingUser, id: string): Promise<void> {
    const outcome = await this.getById(id);

    if (await this.outcomes.hasChildren(id)) {
      throw new ValidationError([
        {
          path: 'id',
          code: 'has_children',
          message:
            'This outcome has content, learner progress, sessions, or assessments attached and can’t be deleted. Archive it instead.',
        },
      ]);
    }

    await this.outcomes.delete(id);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'outcome.deleted',
      entityType: 'Outcome',
      entityId: id,
      before: { titleEn: outcome.titleEn },
    });
  }

  /** `P4-6` — reorders outcomes within one level; rejects an `order` that doesn't exactly match the level's current outcome set. */
  async reorder(actor: ActingUser, levelId: string, order: string[]): Promise<void> {
    const level = await levelRepository.findByIdScoped(levelId);
    if (!level) {
      throw new NotFoundError('Level not found');
    }

    const siblings = await this.outcomes.findByLevel(levelId);
    const siblingIds = new Set(siblings.map((outcome) => outcome.id));

    if (order.length !== siblings.length || !order.every((id) => siblingIds.has(id))) {
      throw new ValidationError([
        {
          path: 'order',
          code: 'invalid',
          message: 'order must contain exactly the outcomes currently on this level',
        },
      ]);
    }

    await this.outcomes.reorder(order);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'outcome.reordered',
      entityType: 'Level',
      entityId: levelId,
      after: { order },
    });
  }
}
