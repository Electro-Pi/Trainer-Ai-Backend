import { ConflictError, NotFoundError, ValidationError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import {
  learnerAssignmentRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { SessionService } from '@/modules/sessions/sessions.module.js';
import { queueService } from '@/queue/queue-instance.js';

import type { CreateTrainingPlanDto, UpdateTrainingPlanDto } from '../dto/training-plan.dto.js';
import { PlanTemplateRepository } from '../repositories/plan-template.repository.js';
import type { TrainingPlan } from '../repositories/training-plan.repository.js';
import { TrainingPlanRepository } from '../repositories/training-plan.repository.js';

import { PlanBuilderService } from './plan-builder.service.js';
import { SessionSchedulingService } from './session-scheduling.service.js';

export interface ActingUser {
  id: string;
  organizationId: string;
  role: string;
}

/**
 * `P7-1`, `P7-3`, `P7-4` — plan CRUD, coverage validation, and the confirm
 * transition. Session generation (`suggest`) lives in `PlanBuilderService`;
 * actually persisting proposed sessions and creating Graph meetings is this
 * service's job so the recommendation pipeline stays free of plan/session
 * concerns (single responsibility).
 */
export class TrainingPlanService {
  private readonly plans = new TrainingPlanRepository();
  private readonly templates = new PlanTemplateRepository();
  private readonly planBuilder = new PlanBuilderService();
  private readonly scheduling = new SessionSchedulingService();
  private readonly sessionService = new SessionService();

  async create(actor: ActingUser, dto: CreateTrainingPlanDto): Promise<TrainingPlan> {
    const learner = await learnerRepository.findByIdScoped(dto.learnerId);
    if (!learner) {
      throw new ValidationError([
        { path: 'learnerId', code: 'not_found', message: 'Learner not found' },
      ]);
    }

    const assignment = await learnerAssignmentRepository.findActiveByLearner(dto.learnerId);
    if (!assignment) {
      throw new ValidationError([
        {
          path: 'learnerId',
          code: 'no_assignment',
          message: 'Learner has no active level assignment',
        },
      ]);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dto.trainingDays);

    const plan = await this.plans.create({
      organizationId: actor.organizationId,
      learnerId: dto.learnerId,
      assignmentId: assignment.id,
      title: `Training plan — ${learner.displayName}`,
      trainingDays: dto.trainingDays,
      startDate,
      endDate,
      createdById: actor.id,
      templateId: dto.templateId ?? null,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'training_plan.created',
      entityType: 'TrainingPlan',
      entityId: plan.id,
      after: { learnerId: dto.learnerId, trainingDays: dto.trainingDays },
    });

    return plan;
  }

  async getById(id: string): Promise<TrainingPlan> {
    const plan = await this.plans.findByIdScoped(id);
    if (!plan) {
      throw new NotFoundError('Training plan not found');
    }
    return plan;
  }

  async update(actor: ActingUser, id: string, dto: UpdateTrainingPlanDto): Promise<TrainingPlan> {
    const plan = await this.getById(id);
    if (plan.status !== 'DRAFT') {
      throw new ConflictError('Only a DRAFT plan can be edited directly');
    }

    const updated = await this.plans.update(plan.id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.trainingDays !== undefined ? { trainingDays: dto.trainingDays } : {}),
      ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
      ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'training_plan.updated',
      entityType: 'TrainingPlan',
      entityId: plan.id,
      before: { title: plan.title, trainingDays: plan.trainingDays },
      after: { title: updated.title, trainingDays: updated.trainingDays },
    });

    return updated;
  }

  /**
   * `TP-05` — proposes a session breakdown and persists it as `SCHEDULED`
   * `Session` rows on this plan; the manager then adjusts via `PATCH
   * /sessions/:id` before ever confirming. Re-running `suggest` on the same
   * DRAFT plan replaces its previously-suggested sessions rather than
   * appending duplicates.
   */
  async suggest(
    actor: ActingUser,
    id: string,
    sessionDurationMinutes?: number,
  ): Promise<TrainingPlan> {
    const plan = await this.getById(id);
    if (plan.status !== 'DRAFT') {
      throw new ConflictError('Only a DRAFT plan can be (re)suggested');
    }

    const breakdown = await this.planBuilder.suggest({
      organizationId: actor.organizationId,
      learnerId: plan.learnerId,
      trainingDays: plan.trainingDays,
      ...(sessionDurationMinutes !== undefined ? { sessionDurationMinutes } : {}),
    });

    await this.scheduling.replaceSuggestedSessions(plan, breakdown.sessions);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'training_plan.suggested',
      entityType: 'TrainingPlan',
      entityId: plan.id,
      after: {
        sessionCount: breakdown.sessions.length,
        deferredItemCount: breakdown.deferredItemCount,
      },
    });

    return plan;
  }

  /**
   * `TP-04` — every outcome required by the learner's active assignment must
   * be the primary outcome of at least one of this plan's sessions. Never
   * silently skipped (mirrors `RC-10`/`CM-13`'s own wording).
   */
  async getCoverage(id: string): Promise<{
    planId: string;
    requiredOutcomeIds: string[];
    coveredOutcomeIds: string[];
    gaps: { outcomeId: string; outcomeTitleEn: string; outcomeTitleAr: string }[];
  }> {
    const plan = await this.getById(id);
    const assignment = await learnerAssignmentRepository.findActiveByLearner(plan.learnerId);
    const requiredOutcomes = assignment
      ? await this.scheduling.findRequiredOutcomes(assignment.id)
      : [];

    const sessions = await this.scheduling.findSessionsByPlan(plan.id);
    const coveredOutcomeIds = new Set(sessions.map((session) => session.primaryOutcomeId));

    const gapOutcomeIds = requiredOutcomes
      .map((lo) => lo.outcomeId)
      .filter((outcomeId) => !coveredOutcomeIds.has(outcomeId));

    const levelOutcomes = assignment ? await outcomeRepository.findByLevel(assignment.levelId) : [];
    const outcomesById = new Map(levelOutcomes.map((outcome) => [outcome.id, outcome]));

    return {
      planId: plan.id,
      requiredOutcomeIds: requiredOutcomes.map((lo) => lo.outcomeId),
      coveredOutcomeIds: [...coveredOutcomeIds],
      gaps: gapOutcomeIds
        .map((outcomeId) => outcomesById.get(outcomeId))
        .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== undefined)
        .map((outcome) => ({
          outcomeId: outcome.id,
          outcomeTitleEn: outcome.titleEn,
          outcomeTitleAr: outcome.titleAr,
        })),
    };
  }

  /**
   * `P7-4` — the hard invariant for plans, mirroring `RC-06` for
   * recommendations: nothing dispatches a real Teams meeting until the
   * manager explicitly confirms. Transitions the plan, then enqueues one
   * `meeting.create` job per session — job keyed by `sessionId` for
   * idempotency (queue catalogue, ARCHITECTURE §10).
   */
  async confirm(actor: ActingUser, id: string): Promise<TrainingPlan> {
    const plan = await this.getById(id);
    if (plan.status !== 'DRAFT') {
      throw new ConflictError('Plan is no longer DRAFT');
    }

    const sessions = await this.scheduling.findSessionsByPlan(plan.id);
    if (sessions.length === 0) {
      throw new ConflictError('Plan has no sessions — run suggest or add sessions first');
    }

    const confirmed = await this.plans.update(plan.id, {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'training_plan.confirmed',
      entityType: 'TrainingPlan',
      entityId: confirmed.id,
      after: { sessionCount: sessions.length },
    });

    for (const session of sessions) {
      await queueService.enqueue(
        'meeting.create',
        { sessionId: session.id, organizationId: actor.organizationId },
        { jobId: `meeting-create-${session.id}` },
      );
    }

    return confirmed;
  }

  /**
   * Cancelling a plan cancels its non-terminal sessions too — an orphaned
   * `SCHEDULED`/`INVITED` session with a real Teams meeting still active
   * would silently leave the learner and manager with a meeting for a plan
   * that no longer exists. `SessionService.cancel` itself handles the Graph
   * meeting cancel + reminder-job removal per session.
   */
  async cancel(actor: ActingUser, id: string): Promise<TrainingPlan> {
    const plan = await this.getById(id);
    if (plan.status === 'CANCELLED' || plan.status === 'COMPLETED') {
      throw new ConflictError('Plan is already in a terminal state');
    }

    const cancelled = await this.plans.update(plan.id, { status: 'CANCELLED' } as never);

    const sessions = await this.scheduling.findSessionsByPlan(plan.id);
    const cancellableStatuses = new Set(['SCHEDULED', 'INVITED', 'IN_PROGRESS']);
    for (const session of sessions) {
      if (cancellableStatuses.has(session.status)) {
        await this.sessionService.cancel(actor, session.id);
      }
    }

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'training_plan.cancelled',
      entityType: 'TrainingPlan',
      entityId: cancelled.id,
      after: { cancelledSessionCount: sessions.length },
    });

    return cancelled;
  }

  async saveAsTemplate(actor: ActingUser, id: string, name: string) {
    const plan = await this.getById(id);
    const assignment = await learnerAssignmentRepository.findActiveByLearner(plan.learnerId);
    if (!assignment) {
      throw new ConflictError('Plan’s learner has no active assignment to derive a template from');
    }

    const sessions = await this.scheduling.findSessionsByPlan(plan.id);
    const structure = {
      trainingDays: plan.trainingDays,
      sessions: await this.scheduling.toTemplateStructure(sessions),
    };

    const template = await this.templates.create({
      organizationId: actor.organizationId,
      name,
      trackId: assignment.trackId,
      levelId: assignment.levelId,
      structure,
      createdById: actor.id,
    } as never);

    await writeAuditLog({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: 'USER',
      action: 'plan_template.created',
      entityType: 'PlanTemplate',
      entityId: template.id,
      after: { name, sourcePlanId: plan.id },
    });

    return template;
  }

  async listTemplates(trackId: string, levelId: string) {
    return this.templates.findByTrackAndLevel(trackId, levelId);
  }
}
