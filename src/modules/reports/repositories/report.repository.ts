import type { Report } from '@prisma/client';

import { BaseRepository } from '@/common/repositories/base.repository.js';
import { prisma } from '@/database/prisma.service.js';

export type { Report };

type ReportDelegate = typeof prisma.report;

export interface ReportListFilters {
  sessionId?: string;
  planId?: string;
  status?: string;
}

export class ReportRepository extends BaseRepository<Report, ReportDelegate> {
  constructor() {
    super(prisma.report, 'createdAt');
  }

  async findBySession(sessionId: string): Promise<Report[]> {
    return this.delegate.findMany({ where: { sessionId } });
  }

  async findByPlan(planId: string): Promise<Report[]> {
    return this.delegate.findMany({ where: { planId } });
  }

  /** `findUnique` isn't tenant-scopable (MEMORY, findById cross-tenant leak trap) — use this for any request-supplied id. */
  async findByIdScoped(id: string): Promise<Report | null> {
    return this.delegate.findFirst({ where: { id } });
  }

  async list(filters: ReportListFilters): Promise<Report[]> {
    return this.delegate.findMany({
      where: {
        ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
        ...(filters.planId ? { planId: filters.planId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      } as never,
      orderBy: { createdAt: 'desc' } as never,
    } as never);
  }

  async markGenerated(id: string, blobKey: string): Promise<Report> {
    return this.update(id, {
      status: 'GENERATED',
      blobKey,
      generatedAt: new Date(),
    } as never);
  }

  async markSent(id: string, recipients: unknown): Promise<Report> {
    return this.update(id, {
      status: 'SENT',
      sentAt: new Date(),
      recipients,
    } as never);
  }

  async markFailed(id: string, failureReason: string): Promise<Report> {
    return this.update(id, { status: 'FAILED', failureReason } as never);
  }

  async incrementResendCount(id: string): Promise<Report> {
    return this.delegate.update({
      where: { id } as never,
      data: { resendCount: { increment: 1 } } as never,
    });
  }
}
