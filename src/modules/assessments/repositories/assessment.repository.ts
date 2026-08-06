import type { Assessment } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type AssessmentDelegate = typeof prisma.assessment;

/** Not directly tenant-scoped — reached via `sessionId` → `Session.organizationId`. */
export class AssessmentRepository extends BaseRepository<Assessment, AssessmentDelegate> {
  constructor() {
    super(prisma.assessment, 'completedAt');
  }

  async findBySession(sessionId: string): Promise<Assessment | null> {
    return this.delegate.findFirst({ where: { sessionId } });
  }
}
