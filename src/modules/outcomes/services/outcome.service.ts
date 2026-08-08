import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { levelRepository } from '@/modules/levels/levels.module.js';

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

    const siblings = await this.outcomes.findByLevel(levelId);

    const created = await this.outcomes.create({
      levelId,
      titleEn: dto.titleEn,
      titleAr: dto.titleAr,
      descriptionEn: dto.descriptionEn,
      descriptionAr: dto.descriptionAr,
      targetSkills: dto.targetSkills,
      trainingForm: dto.trainingForm,
      order: siblings.length,
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

    const updated = await this.outcomes.update(id, {
      ...(dto.titleEn !== undefined ? { titleEn: dto.titleEn } : {}),
      ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr } : {}),
      ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
      ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
      ...(dto.targetSkills !== undefined ? { targetSkills: dto.targetSkills } : {}),
      ...(dto.trainingForm !== undefined ? { trainingForm: dto.trainingForm } : {}),
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
