import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { sessionRepository } from '@/modules/sessions/sessions.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { queueService } from '@/queue/queue-instance.js';

import type { Report, ReportListFilters } from '../repositories/report.repository.js';
import { ReportRepository } from '../repositories/report.repository.js';

const reportRepository = new ReportRepository();

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/** `requireTeamAccess`'s `resolveManagerId` for `GET/POST /reports/:id/*` — a report belongs to a session's learner's team. */
export async function resolveManagerIdByReport(reportId: string): Promise<string | null> {
  const report = await reportRepository.findByIdScoped(reportId);
  if (!report?.sessionId) return null;

  const session = await sessionRepository.findByIdScoped(report.sessionId);
  if (!session) return null;

  const learner = await learnerRepository.findByIdScoped(session.learnerId);
  if (!learner) return null;

  const team = await teamRepository.findByIdScoped(learner.teamId);
  return team?.managerId ?? null;
}

export class ReportService {
  async list(filters: ReportListFilters): Promise<Report[]> {
    return reportRepository.list(filters);
  }

  async getById(id: string): Promise<Report> {
    const report = await reportRepository.findByIdScoped(id);
    if (!report) throw new NotFoundError('Report not found');
    return report;
  }

  /** `ReportResponseDto.learnerId`/`learnerName`/`score`/`verdict`/`outcomeTitle`/`skillName` read-through. */
  async getLearnerAndScore(report: Report) {
    return reportRepository.findLearnerAndScore(report);
  }

  /** `RP-06` — a report must have already generated before it can be re-sent. */
  async resend(actor: ActingUser, id: string): Promise<Report> {
    const report = await this.getById(id);
    if (report.status !== 'SENT' && report.status !== 'GENERATED') {
      throw new ConflictError('Report has not been generated yet');
    }

    const updated = await reportRepository.incrementResendCount(id);

    await queueService.enqueue('report.send', {
      reportId: report.id,
      organizationId: actor.organizationId,
    });

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'report.resend_requested',
      entityType: 'Report',
      entityId: report.id,
    });

    return updated;
  }
}

export interface PlanSummaryRecipient {
  role: 'DEPARTMENT_MANAGER' | 'LEARNER';
  portalUserId?: string;
  email: string;
  name: string;
}

/**
 * `RP-05` — creates one `Report` row per distinct recipient language among
 * {manager, learner} (`RP-02`'s "one session can produce two PDFs" rule
 * extends to plans) and enqueues generation for each. Exported as a function
 * rather than a `ReportService` method — `training-plans` is the only
 * caller (`POST /plans/:id/summary-report`), and it already resolves
 * `learner`/`manager` for `requireTeamAccess`; a `ReportService` method here
 * would need to import `training-plans.module.ts` for `TrainingPlan`, which
 * imports back into this module's controller, forming a cycle.
 */
export async function createPlanSummaryReports(
  organizationId: string,
  planId: string,
  recipientsByLanguage: Map<'EN' | 'AR', PlanSummaryRecipient[]>,
): Promise<Report[]> {
  const reports = await Promise.all(
    [...recipientsByLanguage.entries()].map(async ([language, recipients]) => {
      const report = await reportRepository.create({
        organizationId,
        planId,
        type: 'PLAN_SUMMARY',
        language,
        status: 'PENDING',
        recipients,
      } as never);

      await queueService.enqueue('report.generate', {
        reportId: report.id,
        organizationId,
      });

      return report;
    }),
  );

  return reports;
}
