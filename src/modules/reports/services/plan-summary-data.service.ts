import { NotFoundError } from '@/common/exceptions/app-error.js';
import { assessmentRepository } from '@/modules/assessments/assessments.module.js';
import {
  learnerAssignmentRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { sessionRepository } from '@/modules/sessions/sessions.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { ReportBranding } from './report-data.service.js';

export interface PlanSummarySessionView {
  sequence: number;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
  scheduledStart: string;
  status: string;
  verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null;
  score: number | null;
}

export interface PlanSummaryReportData {
  organizationId: string;
  branding: ReportBranding;
  learnerName: string;
  managerName: string;
  trackNameEn: string;
  trackNameAr: string;
  levelNameEn: string;
  levelNameAr: string;
  planTitle: string;
  startDate: string;
  endDate: string;
  sessions: PlanSummarySessionView[];
  achievedCount: number;
  totalCount: number;
}

/** `RP-05` — assembles the view model for an end-of-plan summary report across every session in a `TrainingPlan`. */
export class PlanSummaryDataService {
  async buildPlanSummary(planId: string): Promise<PlanSummaryReportData> {
    const plan = await trainingPlanRepository.findByIdScoped(planId);
    if (!plan) throw new NotFoundError('Training plan not found');

    const [learner, sessions, organization] = await Promise.all([
      learnerRepository.findByIdScoped(plan.learnerId),
      sessionRepository.findByPlan(planId),
      organizationRepository.findById(plan.organizationId),
    ]);

    if (!learner) throw new NotFoundError('Learner not found');
    if (!organization) throw new NotFoundError('Organization not found');

    const team = await teamRepository.findByIdScoped(learner.teamId);
    if (!team) throw new NotFoundError('Team not found');

    const manager = team.managerId
      ? await portalUserRepository.findByIdScoped(team.managerId)
      : null;
    if (!manager) throw new NotFoundError('Manager not found');

    const assignment = await learnerAssignmentRepository.findById(plan.assignmentId);
    const level = assignment ? await levelRepository.findByIdScoped(assignment.levelId) : null;
    const track = level ? await trackRepository.findByIdScoped(level.trackId) : null;

    const sessionViews = await Promise.all(
      sessions.map(async (session) => {
        const [outcome, assessment] = await Promise.all([
          outcomeRepository.findByIdScoped(session.primaryOutcomeId),
          assessmentRepository.findBySession(session.id),
        ]);
        return {
          sequence: session.sequence,
          outcomeTitleEn: outcome?.titleEn ?? '',
          outcomeTitleAr: outcome?.titleAr ?? '',
          scheduledStart: session.scheduledStart.toISOString(),
          status: session.status,
          verdict: assessment?.verdict ?? session.verdict,
          score: assessment?.totalScore ?? session.score,
        };
      }),
    );

    const branding: ReportBranding = {
      logoUrl:
        (organization.reportBranding as { logoUrl?: string } | null)?.logoUrl ??
        organization.logoUrl,
      primaryColor:
        (organization.reportBranding as { primaryColor?: string } | null)?.primaryColor ?? null,
      organizationName: organization.name,
    };

    return {
      organizationId: plan.organizationId,
      branding,
      learnerName: learner.displayName,
      managerName: manager.name,
      trackNameEn: track?.nameEn ?? '',
      trackNameAr: track?.nameAr ?? '',
      levelNameEn: level?.nameEn ?? '',
      levelNameAr: level?.nameAr ?? '',
      planTitle: plan.title,
      startDate: plan.startDate.toISOString(),
      endDate: plan.endDate.toISOString(),
      sessions: sessionViews,
      achievedCount: sessionViews.filter((s) => s.verdict === 'ACHIEVED').length,
      totalCount: sessionViews.length,
    };
  }
}

export const planSummaryDataService = new PlanSummaryDataService();
