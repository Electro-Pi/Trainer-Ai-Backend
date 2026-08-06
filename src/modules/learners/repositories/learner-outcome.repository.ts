import type { LearnerOutcome, OutcomeStatus } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type LearnerOutcomeDelegate = typeof prisma.learnerOutcome;

/** Not directly tenant-scoped — reached via `learnerId` → `Learner.organizationId`. */
export class LearnerOutcomeRepository extends BaseRepository<
  LearnerOutcome,
  LearnerOutcomeDelegate
> {
  constructor() {
    super(prisma.learnerOutcome, 'createdAt');
  }

  /** Backs the outcome map (`OT-04`) — `(learnerId, status)` is indexed for this. */
  async findByLearner(learnerId: string, status?: OutcomeStatus): Promise<LearnerOutcome[]> {
    return this.delegate.findMany({ where: { learnerId, ...(status ? { status } : {}) } });
  }

  async findByAssignment(assignmentId: string): Promise<LearnerOutcome[]> {
    return this.delegate.findMany({ where: { assignmentId } });
  }
}
