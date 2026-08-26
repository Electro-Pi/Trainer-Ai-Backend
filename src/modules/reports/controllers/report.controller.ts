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
    const isAr = report.language === 'AR';

    try {
      const data = await reportDataService.buildSessionReport(report.sessionId, recipientRole);
      const outcome = data.outcomes[0];
      const strengths = data.traineeEvaluation?.strengths.join('\n') ?? data.strengths;
      const gaps = data.traineeEvaluation?.areas_for_improvement.join('\n') ?? data.gaps;

      return {
        outcomeTitle: isAr ? outcome?.titleAr || outcome?.titleEn || '' : outcome?.titleEn || '',
        verdict: data.overallVerdict,
        sessionDate: data.sessionDate,
        strengths,
        gaps,
        agentNotes: data.agentNotes,
        isCarriedOver: outcome?.isCarriedOver ?? false,
        outcomes: data.outcomes.map((o) => ({
          title: isAr ? o.titleAr || o.titleEn || '' : o.titleEn || '',
          verdict: o.verdict,
          score: o.score,
          isCarriedOver: o.isCarriedOver,
        })),
        trackName: isAr ? data.trackNameAr || data.trackNameEn : data.trackNameEn,
        levelName: isAr ? data.levelNameAr || data.levelNameEn : data.levelNameEn,
        content: data.content,
        answerCount: data.answerCount,
        traineeEvaluation: data.traineeEvaluation
          ? {
              overallScore: data.traineeEvaluation.overall_score,
              passed: data.traineeEvaluation.passed,
              summaryFeedback: data.traineeEvaluation.summary_feedback,
              questions: data.traineeEvaluation.questions.map((q) => ({
                questionIndex: q.question_index,
                questionText: q.question_text,
                traineeAnswerText: q.trainee_answer_text,
                isCorrect: q.is_correct,
                aiFeedback: q.ai_feedback,
                outcomeText: q.outcome_text,
              })),
              outcomeResults: data.traineeEvaluation.outcome_results.map((r) => ({
                outcome: r.outcome,
                questionsAsked: r.questions_asked,
                questionsCorrect: r.questions_correct,
                passed: r.passed,
              })),
            }
          : null,
        managerEvaluation: data.managerEvaluation
          ? {
              overallScore: data.managerEvaluation.overall_score,
              passed: data.managerEvaluation.passed,
              readiness: data.managerEvaluation.readiness,
              riskAreas: data.managerEvaluation.risk_areas,
              outcomeCoverageComparison: data.managerEvaluation.outcome_coverage_comparison,
              questions: data.managerEvaluation.questions.map((q) => ({
                questionIndex: q.question_index,
                questionText: q.question_text,
                traineeAnswerText: q.trainee_answer_text,
                isCorrect: q.is_correct,
                managerFeedback: q.manager_feedback,
                outcomeText: q.outcome_text,
              })),
              outcomeResults: data.managerEvaluation.outcome_results.map((r) => ({
                outcome: r.outcome,
                questionsAsked: r.questions_asked,
                questionsCorrect: r.questions_correct,
                passed: r.passed,
              })),
            }
          : null,
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
