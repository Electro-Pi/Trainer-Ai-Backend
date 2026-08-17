import type { LearnerAssignment, LearnerOutcome } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { LearnerAssignment };

type LearnerAssignmentDelegate = typeof prisma.learnerAssignment;

export interface AssignWithOutcomesInput {
  learnerId: string;
  trackId: string;
  levelId: string;
  assignedById: string;
  /** Ids of outcomes belonging to `levelId`, in the level's own order. */
  outcomeIds: string[];
  /** Outcome ids the learner already achieved on a prior assignment (`LV-06`) — carried forward as `ACHIEVED`, not reset to `NOT_STARTED`. */
  previouslyAchievedOutcomeIds: string[];
}

/** Not directly tenant-scoped — reached via `learnerId` → `Learner.organizationId`. */
export class LearnerAssignmentRepository extends BaseRepository<
  LearnerAssignment,
  LearnerAssignmentDelegate
> {
  constructor() {
    super(prisma.learnerAssignment, 'assignedAt');
  }

  async findActiveByLearner(learnerId: string): Promise<LearnerAssignment | null> {
    return this.delegate.findFirst({ where: { learnerId, isActive: true } });
  }

  /**
   * `LearnerAssignment` is not itself in the tenant extension's scoped-model
   * set (reached transitively via `Learner`, per `tenant.extension.ts`'s own
   * doc comment) — filter through `learner.organizationId` explicitly, same
   * pattern `OutcomeRepository.findByIdScoped` uses via `level.track`.
   */
  async findByIdScoped(id: string, organizationId: string): Promise<LearnerAssignment | null> {
    return this.delegate.findFirst({ where: { id, learner: { organizationId } } });
  }

  async findByLearner(learnerId: string): Promise<LearnerAssignment[]> {
    return this.delegate.findMany({ where: { learnerId }, orderBy: { assignedAt: 'desc' } });
  }

  /**
   * `LV-01`…`LV-04`, `LV-06`, `TM-07` — one atomic write: retires the
   * learner's current active assignment (history preserved, never deleted —
   * non-negotiable 17), creates the new one, and materializes a
   * `LearnerOutcome` row per outcome in the target level. An outcome the
   * learner already achieved under a previous assignment starts `ACHIEVED`
   * instead of `NOT_STARTED`, per `LV-06`. Lives on the repository (not the
   * service) because `BaseRepository` has no transaction primitive and
   * D-12b keeps every Prisma call — including multi-statement ones — inside
   * a repository.
   */
  async assignWithOutcomes(
    input: AssignWithOutcomesInput,
  ): Promise<{ assignment: LearnerAssignment; outcomes: LearnerOutcome[] }> {
    return prisma.$transaction(async (tx) => {
      await tx.learnerAssignment.updateMany({
        where: { learnerId: input.learnerId, isActive: true },
        data: { isActive: false, completedAt: new Date() },
      });

      const assignment = await tx.learnerAssignment.create({
        data: {
          learnerId: input.learnerId,
          trackId: input.trackId,
          levelId: input.levelId,
          assignedById: input.assignedById,
        },
      });

      const achieved = new Set(input.previouslyAchievedOutcomeIds);
      const outcomes = await Promise.all(
        input.outcomeIds.map((outcomeId, index) =>
          tx.learnerOutcome.create({
            data: {
              learnerId: input.learnerId,
              outcomeId,
              assignmentId: assignment.id,
              priority: index,
              status: achieved.has(outcomeId) ? 'ACHIEVED' : 'NOT_STARTED',
              achievedAt: achieved.has(outcomeId) ? new Date() : null,
            },
          }),
        ),
      );

      return { assignment, outcomes };
    });
  }
}
