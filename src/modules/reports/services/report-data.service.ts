import { NotFoundError } from '@/common/exceptions/app-error.js';
import {
  assessmentAnswerRepository,
  assessmentRepository,
} from '@/modules/assessments/assessments.module.js';
import { contentItemRepository } from '@/modules/content/content.module.js';
import { learnerRepository } from '@/modules/learners/learners.module.js';
import { levelRepository } from '@/modules/levels/levels.module.js';
import { organizationRepository } from '@/modules/organizations/organizations.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import {
  sessionContentRepository,
  sessionOutcomeRepository,
  sessionRepository,
} from '@/modules/sessions/sessions.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { trackRepository } from '@/modules/tracks/tracks.module.js';
import { trainingPlanRepository } from '@/modules/training-plans/training-plans.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

export interface ReportBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  organizationName: string;
}

export interface SessionReportOutcomeView {
  titleEn: string;
  titleAr: string;
  verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null;
  score: number | null;
  isCarriedOver: boolean;
}

export interface SessionReportContentView {
  title: string;
  contentType: string;
  delivered: boolean;
}

export interface SessionReportData {
  organizationId: string;
  branding: ReportBranding;
  learnerName: string;
  managerName: string;
  trackNameEn: string;
  trackNameAr: string;
  levelNameEn: string;
  levelNameAr: string;
  sessionDate: string;
  overallVerdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
  overallScore: number;
  outcomes: SessionReportOutcomeView[];
  content: SessionReportContentView[];
  strengths: string;
  gaps: string;
  agentNotes: string;
  answerCount: number;
  managerPortalUserId: string;
  managerEmail: string;
  learnerEmail: string;
  learnerLanguage: 'EN' | 'AR';
  managerLanguage: 'EN' | 'AR';
}

function resolveBranding(organization: {
  reportBranding: unknown;
  logoUrl: string | null;
  name: string;
}): ReportBranding {
  const branding = organization.reportBranding as
    { logoUrl?: string; primaryColor?: string } | null | undefined;
  return {
    logoUrl: branding?.logoUrl ?? organization.logoUrl,
    primaryColor: branding?.primaryColor ?? null,
    organizationName: organization.name,
  };
}

/**
 * `RP-03`, `RP-04` — assembles the full view model a session report template
 * needs. Deliberately reads across many modules' sanctioned surfaces rather
 * than living inside one of them — a report is inherently cross-cutting, the
 * same reasoning `analytics` (P10) will follow.
 */
export class ReportDataService {
  async buildSessionReport(sessionId: string): Promise<SessionReportData> {
    const session = await sessionRepository.findByIdScoped(sessionId);
    if (!session) throw new NotFoundError('Session not found');

    const [assessment, learner, plan, sessionOutcomes, sessionContents] = await Promise.all([
      assessmentRepository.findBySession(sessionId),
      learnerRepository.findByIdScoped(session.learnerId),
      trainingPlanRepository.findByIdScoped(session.planId),
      sessionOutcomeRepository.findBySession(sessionId),
      sessionContentRepository.findBySession(sessionId),
    ]);

    if (!assessment) throw new NotFoundError('Assessment not found for session');
    if (!learner) throw new NotFoundError('Learner not found');
    if (!plan) throw new NotFoundError('Training plan not found');

    const [team, organization, answers] = await Promise.all([
      teamRepository.findByIdScoped(learner.teamId),
      organizationRepository.findById(session.organizationId),
      assessmentAnswerRepository.findByAssessment(assessment.id),
    ]);

    if (!team) throw new NotFoundError('Team not found');
    if (!organization) throw new NotFoundError('Organization not found');

    const manager = team.managerId
      ? await portalUserRepository.findByIdScoped(team.managerId)
      : null;
    if (!manager) throw new NotFoundError('Manager not found');

    const outcomeIds = [...new Set(sessionOutcomes.map((so) => so.outcomeId))];
    const outcomes = await Promise.all(
      outcomeIds.map((id) => outcomeRepository.findByIdScoped(id)),
    );
    const outcomeById = new Map(outcomes.filter((o) => o !== null).map((o) => [o.id, o]));

    const firstOutcome = outcomes.find((o) => o !== null);
    const level = firstOutcome ? await levelRepository.findByIdScoped(firstOutcome.levelId) : null;
    const track = level ? await trackRepository.findByIdScoped(level.trackId) : null;

    const contentItemIds = [...new Set(sessionContents.map((sc) => sc.contentItemId))];
    const contentItems = await Promise.all(
      contentItemIds.map((id) => contentItemRepository.findByIdScoped(id)),
    );
    const contentItemById = new Map(contentItems.filter((c) => c !== null).map((c) => [c.id, c]));

    const branding = resolveBranding(organization);

    return {
      organizationId: session.organizationId,
      branding,
      learnerName: learner.displayName,
      managerName: manager.name,
      trackNameEn: track?.nameEn ?? '',
      trackNameAr: track?.nameAr ?? '',
      levelNameEn: level?.nameEn ?? '',
      levelNameAr: level?.nameAr ?? '',
      sessionDate: (session.endedAt ?? session.scheduledStart).toISOString(),
      overallVerdict: assessment.verdict,
      overallScore: assessment.totalScore,
      outcomes: sessionOutcomes.map((so) => {
        const outcome = outcomeById.get(so.outcomeId);
        return {
          titleEn: outcome?.titleEn ?? '',
          titleAr: outcome?.titleAr ?? '',
          verdict: so.verdict,
          score: so.score,
          isCarriedOver: so.isCarriedOver,
        };
      }),
      content: sessionContents.map((sc) => {
        const item = contentItemById.get(sc.contentItemId);
        return {
          title: item?.title ?? '',
          contentType: item?.contentType ?? '',
          delivered: sc.deliveredAt !== null,
        };
      }),
      strengths: assessment.strengths,
      gaps: assessment.gaps,
      agentNotes: assessment.agentNotes,
      answerCount: answers.length,
      managerPortalUserId: manager.id,
      managerEmail: manager.email,
      learnerEmail: learner.email,
      learnerLanguage: learner.preferredLanguage,
      managerLanguage: manager.locale,
    };
  }
}

export const reportDataService = new ReportDataService();
