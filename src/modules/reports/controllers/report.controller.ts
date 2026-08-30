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
    verdict: learnerAndScore.verdict as ReportResponseDto['verdict'],
    outcomeTitleEn: learnerAndScore.outcomeTitleEn,
    outcomeTitleAr: learnerAndScore.outcomeTitleAr,
    skillNameEn: learnerAndScore.skillNameEn,
    skillNameAr: learnerAndScore.skillNameAr,
  };
}

export class ReportController {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as {
      sessionId?: string;
      planId?: string;
      status?: string;
      page: number;
      limit: number;
      q?: string;
      verdict?: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
      type?: 'SESSION' | 'PLAN_SUMMARY';
    };
    const results = await reports.list(query);

    // A completed session emits one Report row per recipient (learner +
    // manager). They differ only in which evaluation the emailed PDF carries,
    // so listing both showed every session twice with identical score, verdict
    // and date. Collapse to one row per session — the detail page serves both
    // views as tabs from a single id. Non-SESSION reports (PLAN_SUMMARY) have
    // no sessionId and are never collapsed; `list` is already ordered
    // `createdAt desc`, so the row kept is the most recent for that session.
    const seenSessionIds = new Set<string>();
    const collapsed = results.filter((report) => {
      if (report.type !== 'SESSION' || !report.sessionId) return true;
      if (seenSessionIds.has(report.sessionId)) return false;
      seenSessionIds.add(report.sessionId);
      return true;
    });

    const typeFiltered = query.type
      ? collapsed.filter((report) => report.type === query.type)
      : collapsed;

    // `q` and `verdict` match on learner name and outcome/skill title, which
    // are resolved per row by `getLearnerAndScore` rather than stored on
    // `Report` — so unlike `status`/`planId` they can't be pushed into the
    // Prisma query, and every candidate row has to be hydrated before it can
    // be matched. Only done when one of these filters is actually set; the
    // unfiltered path still hydrates just the current page.
    const needsHydratedFilter = Boolean(query.q || query.verdict);
    const needle = query.q?.toLowerCase() ?? '';

    let total: number;
    let page: number;
    let data: ReportResponseDto[];

    if (needsHydratedFilter) {
      const hydrated = await Promise.all(
        typeFiltered.map(async (report) =>
          toResponseDto(report, await reports.getLearnerAndScore(report)),
        ),
      );
      const matched = hydrated.filter((row) => {
        if (query.verdict && row.verdict !== query.verdict) return false;
        if (!needle) return true;
        return [
          row.learnerName,
          row.outcomeTitleEn,
          row.outcomeTitleAr,
          row.skillNameEn,
          row.skillNameAr,
        ].some((field) => field?.toLowerCase().includes(needle));
      });

      total = matched.length;
      const totalPagesLocal = Math.max(1, Math.ceil(total / query.limit));
      page = Math.min(query.page, totalPagesLocal);
      data = matched.slice((page - 1) * query.limit, (page - 1) * query.limit + query.limit);
    } else {
      // Paged after collapsing, not before — slicing the raw rows first would
      // hand back short, uneven pages once each session's two recipient rows
      // fold into one. `getLearnerAndScore` runs per row, so only the current
      // page is hydrated.
      total = typeFiltered.length;
      const totalPagesLocal = Math.max(1, Math.ceil(total / query.limit));
      page = Math.min(query.page, totalPagesLocal);
      const start = (page - 1) * query.limit;
      data = await Promise.all(
        typeFiltered
          .slice(start, start + query.limit)
          .map(async (report) => toResponseDto(report, await reports.getLearnerAndScore(report))),
      );
    }

    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    res.status(200).json({
      data,
      pageInfo: {
        nextCursor: null,
        hasNextPage: page < totalPages,
        page,
        limit: query.limit,
        total,
        totalPages,
      },
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

    const isAr = report.language === 'AR';

    try {
      // Always built as DEPARTMENT_MANAGER so the payload carries *both*
      // evaluations: the portal shows one page per session with a Learner and
      // a Manager tab, rather than two near-identical rows in the list. The
      // role gate still applies where it matters — `generate-report.job.ts`
      // passes each recipient's own role, so a learner's emailed PDF never
      // contains the manager view. Learners have no portal access to this
      // route at all: `requireTeamAccess` on `GET /reports/:id` admits only
      // ADMIN and the DEPARTMENT_MANAGER who owns the team.
      const data = await reportDataService.buildSessionReport(
        report.sessionId,
        'DEPARTMENT_MANAGER',
      );
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
