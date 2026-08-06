import type { AssessmentAnswer } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type AssessmentAnswerDelegate = typeof prisma.assessmentAnswer;

/** Not directly tenant-scoped — reached via `assessmentId` → `sessionId` → `Session.organizationId`. */
export class AssessmentAnswerRepository extends BaseRepository<
  AssessmentAnswer,
  AssessmentAnswerDelegate
> {
  constructor() {
    super(prisma.assessmentAnswer, 'answeredAt');
  }

  async findByAssessment(assessmentId: string): Promise<AssessmentAnswer[]> {
    return this.delegate.findMany({ where: { assessmentId }, orderBy: { answeredAt: 'asc' } });
  }
}
