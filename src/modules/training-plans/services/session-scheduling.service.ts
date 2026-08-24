import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import { learnerOutcomeRepository } from '@/modules/learners/learners.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import {
  sessionContentRepository,
  sessionOutcomeRepository,
  sessionRepository,
} from '@/modules/sessions/sessions.module.js';

import type { SuggestedSession } from './plan-builder.service.js';

export interface TemplateSessionStructure {
  sequence: number;
  primaryOutcomeId: string;
  durationMinutes: number;
  contentItemIds: string[];
}

/**
 * Owns the mechanics of turning a proposed breakdown into real `Session`
 * rows scheduled across a plan's `trainingDays`, and reading them back for
 * coverage/confirm/template flows — kept out of `TrainingPlanService` so that
 * service stays focused on the plan's own lifecycle, not session scheduling
 * math (single responsibility).
 */
export class SessionSchedulingService {
  private readonly sessions = sessionRepository;
  private readonly sessionOutcomes = sessionOutcomeRepository;
  private readonly sessionContents = sessionContentRepository;

  async findSessionsByPlan(planId: string): Promise<Session[]> {
    return this.sessions.findByPlan(planId);
  }

  async findRequiredOutcomes(assignmentId: string): Promise<LearnerOutcome[]> {
    return learnerOutcomeRepository.findByAssignment(assignmentId);
  }

  /**
   * One calendar day per suggested session, starting at the plan's own
   * `startDate` — the manager reschedules individual sessions afterward
   * (`TP-06`) if a day needs to move. Deletes any previously-suggested
   * sessions on this DRAFT plan first so re-running `suggest` doesn't
   * duplicate rows (only ever called on a DRAFT plan — `TrainingPlanService`
   * enforces that before calling in).
   */
  async replaceSuggestedSessions(
    plan: { id: string; organizationId: string; learnerId: string; startDate: Date },
    suggested: SuggestedSession[],
  ): Promise<Session[]> {
    await this.sessions.deleteByPlan(plan.id);

    const requiredOutcomes = await learnerOutcomeRepository.findByLearner(plan.learnerId);
    const carriedOverOutcomeIds = requiredOutcomes
      .filter((lo) => lo.attemptCount > 0 && lo.status !== 'ACHIEVED')
      .map((lo) => lo.outcomeId);

    const created: Session[] = [];
    for (const item of suggested) {
      const scheduledStart = new Date(plan.startDate);
      scheduledStart.setDate(scheduledStart.getDate() + (item.sequence - 1));
      const scheduledEnd = new Date(scheduledStart.getTime() + item.durationMinutes * 60_000);

      const session = await this.sessions.createWithContent({
        organizationId: plan.organizationId,
        planId: plan.id,
        learnerId: plan.learnerId,
        primaryOutcomeId: item.primaryOutcomeId,
        sequence: item.sequence,
        scheduledStart,
        scheduledEnd,
        durationMinutes: item.durationMinutes,
        outcomeIds: item.outcomeIds,
        carriedOverOutcomeIds: carriedOverOutcomeIds.filter((id) => !item.outcomeIds.includes(id)),
        contentItemIds: item.contentItemIds,
      });
      created.push(session);
    }

    return created;
  }

  async toTemplateStructure(sessions: Session[]): Promise<TemplateSessionStructure[]> {
    const contents = await this.sessionContents.findBySessions(sessions.map((s) => s.id));
    const contentIdsBySession = new Map<string, string[]>();
    for (const content of contents) {
      const existing = contentIdsBySession.get(content.sessionId) ?? [];
      existing.push(content.contentItemId);
      contentIdsBySession.set(content.sessionId, existing);
    }

    return sessions.map((session) => ({
      sequence: session.sequence,
      primaryOutcomeId: session.primaryOutcomeId,
      durationMinutes: session.durationMinutes,
      contentItemIds: contentIdsBySession.get(session.id) ?? [],
    }));
  }

  async findOutcomesBySession(sessionId: string) {
    return this.sessionOutcomes.findBySession(sessionId);
  }
}
