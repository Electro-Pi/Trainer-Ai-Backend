import type { Report } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

type ReportDelegate = typeof prisma.report;

export class ReportRepository extends BaseRepository<Report, ReportDelegate> {
  constructor() {
    super(prisma.report, 'createdAt');
  }

  async findBySession(sessionId: string): Promise<Report[]> {
    return this.delegate.findMany({ where: { sessionId } });
  }
}
