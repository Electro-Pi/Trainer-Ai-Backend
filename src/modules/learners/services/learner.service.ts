import { NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { PageResult } from '@/common/repositories/base.repository.js';

import type { PutLearnerExperienceDto, UpdateLearnerDto } from '../dto/learner.dto.js';
import {
  LearnerExperienceRepository,
  type LearnerExperience,
} from '../repositories/learner-experience.repository.js';
import { LearnerRepository, type Learner } from '../repositories/learner.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `learners` module — P3-4, P3-5. Row-level team ownership is enforced by the router (`requireTeamAccess`), same pattern as `teams`. */
export class LearnerService {
  private readonly learners = new LearnerRepository();
  private readonly experiences = new LearnerExperienceRepository();

  async list(
    limit: number,
    cursor: string | undefined,
    teamId: string | undefined,
  ): Promise<PageResult<Learner>> {
    return this.learners.findMany({
      limit,
      ...(cursor ? { cursor } : {}),
      ...(teamId ? { where: { teamId } } : {}),
    });
  }

  async getById(id: string): Promise<Learner> {
    const learner = await this.learners.findByIdScoped(id);
    if (!learner) {
      throw new NotFoundError('Learner not found');
    }
    return learner;
  }

  async update(actor: ActingUser, id: string, dto: UpdateLearnerDto): Promise<Learner> {
    const before = await this.getById(id);

    const updated = await this.learners.update(id, {
      ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle } : {}),
      ...(dto.department !== undefined ? { department: dto.department } : {}),
      ...(dto.preferredLanguage !== undefined ? { preferredLanguage: dto.preferredLanguage } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'learner.updated',
      entityType: 'Learner',
      entityId: id,
      before: { jobTitle: before.jobTitle, department: before.department },
      after: { jobTitle: updated.jobTitle, department: updated.department },
    });

    return updated;
  }

  /** `TM-05` — non-negotiable 17: deactivate, never hard-delete. Historical reports must survive. */
  async deactivate(actor: ActingUser, id: string): Promise<Learner> {
    const before = await this.getById(id);
    if (before.status === 'INACTIVE') {
      return before;
    }

    const updated = await this.learners.update(id, {
      status: 'INACTIVE',
      deactivatedAt: new Date(),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'learner.deactivated',
      entityType: 'Learner',
      entityId: id,
      before: { status: before.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async getExperience(learnerId: string): Promise<LearnerExperience | null> {
    await this.getById(learnerId);
    return this.experiences.findByLearner(learnerId);
  }

  /** `TM-03` — upsert, since a learner has at most one experience record (`@unique` on `learnerId`). */
  async putExperience(
    actor: ActingUser,
    learnerId: string,
    dto: PutLearnerExperienceDto,
  ): Promise<LearnerExperience> {
    await this.getById(learnerId);

    const existing = await this.experiences.findByLearner(learnerId);

    const data = {
      background: dto.background,
      yearsOfExperience: dto.yearsOfExperience,
      priorTraining: dto.priorTraining ?? null,
      notes: dto.notes ?? null,
      recordedById: actor.id,
    };

    const saved = existing
      ? await this.experiences.update(existing.id, data as never)
      : await this.experiences.create({ learnerId, ...data } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: existing ? 'learner.experience.updated' : 'learner.experience.recorded',
      entityType: 'LearnerExperience',
      entityId: saved.id,
      after: { background: saved.background, yearsOfExperience: saved.yearsOfExperience },
    });

    return saved;
  }
}
