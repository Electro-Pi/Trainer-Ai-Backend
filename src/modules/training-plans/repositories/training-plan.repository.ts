import type { TrainingPlan } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type TrainingPlanDelegate = typeof prisma.trainingPlan;

export class TrainingPlanRepository extends BaseRepository<TrainingPlan, TrainingPlanDelegate> {
  constructor() {
    super(prisma.trainingPlan, 'createdAt');
  }

  async findByLearner(learnerId: string): Promise<TrainingPlan[]> {
    return this.delegate.findMany({ where: { learnerId }, orderBy: { createdAt: 'desc' } });
  }
}
