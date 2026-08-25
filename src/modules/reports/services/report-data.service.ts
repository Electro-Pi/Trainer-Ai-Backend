import { NotFoundError } from '@/common/exceptions/app-error.js';
import { logger } from '@/logger/logger.service.js';
import { aiTrainerClientService } from '@/modules/ai-trainer/ai-trainer.module.js';
import type {
  SessionEvaluationManagerView,
  SessionEvaluationTraineeView,
} from '@/modules/ai-trainer/ai-trainer.module.js';
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
  name: string;
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
  /**
   * The AI Trainer's richer per-role evaluation, when `Session.externalSessionId`
   * resolves and the call succeeds — `null` otherwise (dispatch never
   * happened, the AI Trainer hasn't finished evaluating yet, or the call
   * failed). The template falls back to `strengths`/`gaps`/`agentNotes`
   * above when this is `null`, so a report is never blocked on it.
   */
  traineeEvaluation: SessionEvaluationTraineeView | null;
  /** Only populated for a `DEPARTMENT_MANAGER` recipient's report — `null` for a learner's, and `null` when the AI Trainer hasn't backfilled a manager view for this evaluation. */
  managerEvaluation: SessionEvaluationManagerView | null;
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
  async buildSessionReport(
    sessionId: string,
    recipientRole: 'LEARNER' | 'DEPARTMENT_MANAGER',
  ): Promise<SessionReportData> {
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

    // Best-effort — the evaluation endpoint depends on the AI Trainer's own
    // session record existing (`session.externalSessionId`) and having
    // finished evaluating; either can legitimately not be true yet (or ever,
    // for a session dispatch that failed). Any failure here falls back to
    // `assessment.strengths`/`gaps`/`agentNotes` above rather than blocking
    // report generation on a call this service doesn't control.
    let traineeEvaluation: SessionEvaluationTraineeView | null = null;
    let managerEvaluation: SessionEvaluationManagerView | null = null;
    if (session.externalSessionId) {
      try {
        const evaluation = await aiTrainerClientService.getSessionEvaluation(
          session.externalSessionId,
        );
        traineeEvaluation = evaluation.trainee_view;
        managerEvaluation = evaluation.manager_view;
      } catch (error) {
        logger.warn(
          { sessionId, externalSessionId: session.externalSessionId, err: error },
          'buildSessionReport: evaluation fetch failed, falling back to assessment notes',
        );
      }
    }

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
          name: item?.name ?? '',
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
      traineeEvaluation,
      managerEvaluation: recipientRole === 'DEPARTMENT_MANAGER' ? managerEvaluation : null,
    };
  }
}

export const reportDataService = new ReportDataService();
