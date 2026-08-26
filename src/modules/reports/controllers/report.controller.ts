import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';
import { container } from '@/config/container.js';
import type { StorageService } from '@/shared-types.js';

import type { ReportResponseDto } from '../dto/report.dto.js';
import type { Report } from '../repositories/report.repository.js';
import { reportDataService } from '../services/report-data.service.js';
import { type ActingUser, ReportService } from '../services/report.service.js';

type ReportLearnerAndScore = Awaited<ReturnType<ReportService['getLearnerAndScore']>>;

const reports = new ReportService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toResponseDto(report: Report, learnerAndScore: ReportLearnerAndScore): ReportResponseDto {
  return {
    id: report.id,
    sessionId: report.sessionId,
    planId: report.planId,
    type: report.type,
    language: report.language,
    status: report.status,
    generatedAt: report.generatedAt?.toISOString() ?? null,
    sentAt: report.sentAt?.toISOString() ?? null,
    failureReason: report.failureReason,
    resendCount: report.resendCount,
    createdAt: report.createdAt.toISOString(),
    learnerId: learnerAndScore.learnerId,
    learnerName: learnerAndScore.learnerName,
    score: learnerAndScore.score,
  };
}

export class ReportController {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as { sessionId?: string; planId?: string; status?: string };
    const results = await reports.list(query);
    const data = await Promise.all(
      results.map(async (report) =>
        toResponseDto(report, await reports.getLearnerAndScore(report)),
      ),
    );
    res.status(200).json({
      data,
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  }

  /** `RP-06` — returns metadata plus a time-limited SAS/signed download URL, never the PDF bytes inline. */
  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const report = await reports.getById(id);

    let downloadUrl: string | null = null;
    if (report.blobKey) {
      const storage = container.resolveStorage<StorageService>();
      downloadUrl = await storage.getDownloadUrl(report.blobKey);
    }

    const learnerAndScore = await reports.getLearnerAndScore(report);
    const detail = await this.buildDetail(report);
    res.status(200).json({ ...toResponseDto(report, learnerAndScore), downloadUrl, detail });
  }

  /**
   * Same `ReportDataService.buildSessionReport` view the PDF template
   * renders from — the portal detail page reuses it rather than keeping a
   * second, separately-maintained summary of the same evaluation. `null`
   * for a `PLAN_SUMMARY` report or one whose session record is gone.
   */
  private async buildDetail(report: Report): Promise<ReportResponseDto['detail']> {
    if (report.type !== 'SESSION' || !report.sessionId) return undefined;

    const recipients = report.recipients as { role: 'LEARNER' | 'DEPARTMENT_MANAGER' }[];
    const recipientRole = recipients[0]?.role ?? 'LEARNER';

    try {
      const data = await reportDataService.buildSessionReport(report.sessionId, recipientRole);
      const outcome = data.outcomes[0];
      const strengths = data.traineeEvaluation?.strengths.join('\n') ?? data.strengths;
      const gaps = data.traineeEvaluation?.areas_for_improvement.join('\n') ?? data.gaps;
      return {
        outcomeTitle:
          report.language === 'AR'
            ? outcome?.titleAr || outcome?.titleEn || ''
            : outcome?.titleEn || '',
        verdict: data.overallVerdict,
        sessionDate: data.sessionDate,
        strengths,
        gaps,
        agentNotes: data.agentNotes,
        isCarriedOver: outcome?.isCarriedOver ?? false,
      };
    } catch {
      return undefined;
    }
  }

  async resend(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const report = await reports.resend(toActingUser(req.auth!), id);
    const learnerAndScore = await reports.getLearnerAndScore(report);
    res.status(200).json(toResponseDto(report, learnerAndScore));
  }
}
