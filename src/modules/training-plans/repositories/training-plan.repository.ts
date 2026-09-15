import type { TrainingPlan } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { TrainingPlan };

type TrainingPlanDelegate = typeof prisma.trainingPlan;

export class TrainingPlanRepository extends BaseRepository<TrainingPlan, TrainingPlanDelegate> {
  constructor() {
    super(prisma.trainingPlan, 'createdAt');
  }

  async findByLearner(learnerId: string): Promise<TrainingPlan[]> {
    return this.delegate.findMany({ where: { learnerId }, orderBy: { createdAt: 'desc' } });
  }

  /** Most recent non-terminal plan for a learner — the one "Edit Training Plan" reopens. */
  async findActiveByLearner(learnerId: string): Promise<TrainingPlan | null> {
    return this.delegate.findFirst({
      where: { learnerId, status: { in: ['DRAFT', 'CONFIRMED', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * EVERY non-terminal plan for a learner, oldest first — the plural
   * counterpart to `findActiveByLearner`, which deliberately returns only the
   * most recent one. Deactivating a learner has to sweep all of them: nothing
   * in the schema enforces one active plan per learner, and a leftover
   * DRAFT/CONFIRMED plan keeps its Teams meetings live.
   */
  async findActivePlansByLearner(learnerId: string): Promise<TrainingPlan[]> {
    return this.delegate.findMany({
      where: { learnerId, status: { in: ['DRAFT', 'CONFIRMED', 'ACTIVE'] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<TrainingPlan | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  /**
   * Removes a plan and its snapshot tree. Nothing under
   * `plan_track_snapshots` declares `onDelete: Cascade`, so the children are
   * cleared explicitly, deepest first, inside one transaction — a partial
   * delete would strand snapshot rows pointing at a plan that no longer
   * exists.
   *
   * Sessions are NOT touched here: the service cancels them first (which is
   * what withdraws the Teams meeting) and then detaches them, so a session
   * that already happened survives as a record of what happened.
   */
  async deleteWithSnapshots(planId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const snapshots = await tx.planTrackSnapshot.findMany({
        where: { trainingPlanId: planId },
        select: { id: true },
      });
      const snapshotIds = snapshots.map((snapshot) => snapshot.id);

      const contentSnapshots = await tx.planContentSnapshot.findMany({
        where: { snapshotId: { in: snapshotIds } },
        select: { id: true },
      });
      const outcomeSnapshots = await tx.planOutcomeSnapshot.findMany({
        where: { snapshotId: { in: snapshotIds } },
        select: { id: true },
      });

      await tx.planContentMedia.deleteMany({
        where: { contentSnapshotId: { in: contentSnapshots.map((row) => row.id) } },
      });
      await tx.planContentSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planLearnerOutcomeSnapshot.deleteMany({
        where: { outcomeSnapshotId: { in: outcomeSnapshots.map((row) => row.id) } },
      });
      await tx.planOutcomeSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planSkillSnapshot.deleteMany({ where: { snapshotId: { in: snapshotIds } } });
      await tx.planTrackSnapshot.deleteMany({ where: { trainingPlanId: planId } });

      await tx.trainingPlan.delete({ where: { id: planId } });
    });
  }
}
