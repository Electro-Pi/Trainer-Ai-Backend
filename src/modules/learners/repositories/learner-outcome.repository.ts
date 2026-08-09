import type { LearnerOutcome, OutcomeStatus } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { LearnerOutcome, OutcomeStatus };

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

  async findOne(
    learnerId: string,
    outcomeId: string,
    assignmentId: string,
  ): Promise<LearnerOutcome | null> {
    return this.delegate.findFirst({ where: { learnerId, outcomeId, assignmentId } });
  }

  /**
   * `OT-01`, `OT-05` — the `complete` transaction's per-outcome write (P8-8).
   * `ACHIEVED` locks in `achievedAt`; anything else increments `attemptCount`
   * and reports whether this is now a **repeat** failure (`attemptCount > 1`
   * after increment) so the caller can raise `OT-05`'s escalation — this
   * repository only persists the number, the escalation itself is the
   * caller's job (event handler, not a write here).
   */
  async applyVerdict(
    id: string,
    verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED',
    score: number,
  ): Promise<{ outcome: LearnerOutcome; isRepeatFailure: boolean }> {
    const achieved = verdict === 'ACHIEVED';
    const outcome = await this.delegate.update({
      where: { id } as never,
      data: {
        status: achieved ? 'ACHIEVED' : 'IN_PROGRESS',
        lastScore: score,
        achievedAt: achieved ? new Date() : null,
        attemptCount: { increment: 1 },
      } as never,
    });

    return { outcome, isRepeatFailure: !achieved && outcome.attemptCount > 1 };
  }
}
