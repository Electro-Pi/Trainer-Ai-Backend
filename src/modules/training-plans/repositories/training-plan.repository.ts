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

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<TrainingPlan | null> {
    return this.delegate.findFirst({ where: { id } });
  }
}
