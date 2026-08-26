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

  /** Every generated report's blob key — `cleanup.job`'s orphaned-blob sweep excludes these from deletion. */
  async findAllBlobKeys(): Promise<string[]> {
    const rows = await this.delegate.findMany({
      where: { blobKey: { not: null } },
      take: 1_000_000,
    });
    return rows.map((row) => row.blobKey).filter((key): key is string => key !== null);
  }

  /**
   * `ReportResponseDto.learnerId`/`learnerName`/`score`/`verdict`/`outcomeTitle`/
   * `skillName` read-through — a `Report` doesn't carry these itself (RP-05:
   * it only links to a `Session` or `TrainingPlan`), so they're resolved from
   * whichever the report is for. SESSION reports use that one session's own
   * fields (plus its `primaryOutcome`/`skill`, one join away — cheap enough
   * for the list endpoint, unlike the full `ReportDataService.buildSessionReport`
   * detail view); PLAN_SUMMARY reports average every scored session under the
   * plan and have no single outcome/skill to report. Queries `prisma.session` /
   * `prisma.trainingPlan` / `prisma.learner` directly instead of importing
   * `sessions`/`training-plans`/`learners`' `*.module.js` — `reports` sits on
   * the back-edge of `training-plans`' route chain (`createPlanSummaryReports`
   * is called from `training-plan.controller.ts`), so a cross-module import
   * back would cycle (import-x/no-cycle).
   */
  async findLearnerAndScore(report: Report): Promise<{
    learnerId: string | null;
    learnerName: string | null;
    score: number | null;
    verdict: string | null;
    outcomeTitleEn: string | null;
    outcomeTitleAr: string | null;
    skillNameEn: string | null;
    skillNameAr: string | null;
  }> {
    const empty = {
      learnerId: null,
      learnerName: null,
      score: null,
      verdict: null,
      outcomeTitleEn: null,
      outcomeTitleAr: null,
      skillNameEn: null,
      skillNameAr: null,
    };

    if (report.sessionId) {
      const session = await prisma.session.findFirst({
        where: { id: report.sessionId },
        select: {
          learnerId: true,
          score: true,
          verdict: true,
          learner: { select: { displayName: true } },
          primaryOutcome: {
            select: {
              titleEn: true,
              titleAr: true,
              skill: { select: { nameEn: true, nameAr: true } },
            },
          },
        },
      });
      if (!session) return empty;
      return {
        learnerId: session.learnerId,
        learnerName: session.learner.displayName,
        score: session.score,
        verdict: session.verdict,
        outcomeTitleEn: session.primaryOutcome?.titleEn ?? null,
        outcomeTitleAr: session.primaryOutcome?.titleAr ?? null,
        skillNameEn: session.primaryOutcome?.skill?.nameEn ?? null,
        skillNameAr: session.primaryOutcome?.skill?.nameAr ?? null,
      };
    }

    if (report.planId) {
      const plan = await prisma.trainingPlan.findFirst({
        where: { id: report.planId },
        select: { learnerId: true, learner: { select: { displayName: true } } },
      });
      if (!plan) return empty;
      const sessions = await prisma.session.findMany({
        where: { planId: report.planId },
        select: { score: true },
      });
      const scored = sessions.map((s) => s.score).filter((s): s is number => s !== null);
      const avgScore =
        scored.length > 0
          ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)
          : null;
      return {
        ...empty,
        learnerId: plan.learnerId,
        learnerName: plan.learner.displayName,
        score: avgScore,
      };
    }

    return empty;
  }
}
