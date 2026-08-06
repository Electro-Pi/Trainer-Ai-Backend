import { NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { eventBus } from '@/events/event-bus.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';

import type { AssignLearnerDto, PatchLearnerOutcomesDto } from '../dto/learner.dto.js';
import {
  LearnerAssignmentRepository,
  type LearnerAssignment,
} from '../repositories/learner-assignment.repository.js';
import {
  LearnerOutcomeRepository,
  type LearnerOutcome,
} from '../repositories/learner-outcome.repository.js';
import { LearnerRepository } from '../repositories/learner.repository.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `learners` module — P3-6, P3-7. The recommendation trigger this fires into (`LEVEL_ASSIGNED`, `RC-01`) is P6's job; this service only publishes the fact. */
export class LearnerAssignmentService {
  private readonly learners = new LearnerRepository();
  private readonly assignments = new LearnerAssignmentRepository();
  private readonly learnerOutcomes = new LearnerOutcomeRepository();

  /** `LV-01`…`LV-04`, `LV-06`, `TM-07`. */
  async assign(
    actor: ActingUser,
    learnerId: string,
    dto: AssignLearnerDto,
  ): Promise<{ assignment: LearnerAssignment; outcomes: LearnerOutcome[] }> {
    const learner = await this.learners.findByIdScoped(learnerId);
    if (!learner) {
      throw new NotFoundError('Learner not found');
    }

    const track = await trackRepository.findByIdScoped(dto.trackId);
    if (!track || !track.isEnabled) {
      throw new ValidationError([
        { path: 'trackId', code: 'invalid', message: 'trackId must reference an enabled track' },
      ]);
    }

    const level = await levelRepository.findByIdScoped(dto.levelId);
    if (!level || level.trackId !== dto.trackId || !level.isEnabled) {
      throw new ValidationError([
        {
          path: 'levelId',
          code: 'invalid',
          message: 'levelId must reference an enabled level belonging to trackId',
        },
      ]);
    }

    const levelOutcomes = await outcomeRepository.findByLevel(dto.levelId);
    const enabledOutcomes = levelOutcomes.filter((outcome) => outcome.isEnabled);

    const previousOutcomes = await this.learnerOutcomes.findByLearner(learnerId, 'ACHIEVED');

    const result = await this.assignments.assignWithOutcomes({
      learnerId,
      trackId: dto.trackId,
      levelId: dto.levelId,
      assignedById: actor.id,
      outcomeIds: enabledOutcomes.map((outcome) => outcome.id),
      previouslyAchievedOutcomeIds: previousOutcomes.map((outcome) => outcome.outcomeId),
    });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'learner.assignment.created',
      entityType: 'LearnerAssignment',
      entityId: result.assignment.id,
      after: { trackId: dto.trackId, levelId: dto.levelId, outcomeCount: result.outcomes.length },
    });

    // Rule 1 (ARCHITECTURE §4.4) — publish only after the transaction inside
    // `assignWithOutcomes` has committed, never inside it.
    eventBus.publish('learner.level.assigned', {
      learnerId,
      organizationId: actor.organizationId,
      trackId: dto.trackId,
      levelId: dto.levelId,
      assignedById: actor.id,
    });

    return result;
  }

  /**
   * `OT-04` — the outcome map: every `LearnerOutcome` the learner has ever
   * had, across all assignments (`TM-07` requires assignment history to
   * stay visible, not just the active one), optionally filtered by status.
   */
  async getOutcomeMap(
    learnerId: string,
    status?: LearnerOutcome['status'],
  ): Promise<LearnerOutcome[]> {
    const learner = await this.learners.findByIdScoped(learnerId);
    if (!learner) {
      throw new NotFoundError('Learner not found');
    }
    return this.learnerOutcomes.findByLearner(learnerId, status);
  }

  /** `LV-05` — manager adds/removes/reprioritizes outcomes for the learner's *active* assignment. */
  async patchOutcomes(
    actor: ActingUser,
    learnerId: string,
    dto: PatchLearnerOutcomesDto,
  ): Promise<LearnerOutcome[]> {
    const assignment = await this.assignments.findActiveByLearner(learnerId);
    if (!assignment) {
      throw new ValidationError([
        {
          path: 'learnerId',
          code: 'no-active-assignment',
          message: 'Learner has no active track/level assignment to customize outcomes for',
        },
      ]);
    }

    let current = await this.learnerOutcomes.findByAssignment(assignment.id);

    for (const outcomeId of dto.add ?? []) {
      const outcome = await outcomeRepository.findByIdScoped(outcomeId);
      if (!outcome) {
        throw new ValidationError([
          { path: 'add', code: 'invalid', message: `Outcome ${outcomeId} does not exist` },
        ]);
      }

      if (current.some((row) => row.outcomeId === outcomeId)) continue;

      const created = await this.learnerOutcomes.create({
        learnerId,
        outcomeId,
        assignmentId: assignment.id,
        isCustom: true,
        priority: current.length,
      } as never);
      current = [...current, created];

      await writeAuditLog({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: 'USER',
        action: 'learner.outcome.added',
        entityType: 'LearnerOutcome',
        entityId: created.id,
        after: { outcomeId },
      });
    }

    for (const outcomeId of dto.remove ?? []) {
      const row = current.find((candidate) => candidate.outcomeId === outcomeId);
      if (!row) continue;

      if (!row.isCustom) {
        throw new ValidationError([
          {
            path: 'remove',
            code: 'not-custom',
            message: `Outcome ${outcomeId} is part of the level's base set and cannot be removed`,
          },
        ]);
      }

      await this.learnerOutcomes.delete(row.id);
      current = current.filter((candidate) => candidate.id !== row.id);

      await writeAuditLog({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: 'USER',
        action: 'learner.outcome.removed',
        entityType: 'LearnerOutcome',
        entityId: row.id,
        before: { outcomeId },
      });
    }

    for (const { outcomeId, priority } of dto.reprioritize ?? []) {
      const row = current.find((candidate) => candidate.outcomeId === outcomeId);
      if (!row) continue;

      const updated = await this.learnerOutcomes.update(row.id, { priority } as never);
      current = current.map((candidate) => (candidate.id === row.id ? updated : candidate));
    }

    return current;
  }
}
