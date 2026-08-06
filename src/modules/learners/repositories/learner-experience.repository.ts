import type { LearnerExperience } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type LearnerExperienceDelegate = typeof prisma.learnerExperience;

/** Not directly tenant-scoped — reached via `learnerId` → `Learner.organizationId`. */
export class LearnerExperienceRepository extends BaseRepository<
  LearnerExperience,
  LearnerExperienceDelegate
> {
  constructor() {
    super(prisma.learnerExperience, 'createdAt');
  }

  async findByLearner(learnerId: string): Promise<LearnerExperience | null> {
    return this.delegate.findFirst({ where: { learnerId } });
  }
}
