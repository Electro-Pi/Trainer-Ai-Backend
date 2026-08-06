import type { LearnerAssignment } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type LearnerAssignmentDelegate = typeof prisma.learnerAssignment;

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

  async findByLearner(learnerId: string): Promise<LearnerAssignment[]> {
    return this.delegate.findMany({ where: { learnerId }, orderBy: { assignedAt: 'desc' } });
  }
}
