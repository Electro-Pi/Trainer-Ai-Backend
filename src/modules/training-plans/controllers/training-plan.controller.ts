import type { Request, Response } from 'express';

import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import type { AuthContext } from '@/common/types/express.js';
import {
  LearnerService,
  learnerRepository,
  toLearnerResponseDto,
} from '@/modules/learners/learners.module.js';
import {
  createPlanSummaryReports,
  type PlanSummaryRecipient,
} from '@/modules/reports/reports.module.js';
import { SessionService } from '@/modules/sessions/sessions.module.js';
import { teamRepository } from '@/modules/teams/teams.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type {
  CreateTrainingPlanDto,
  PlanCoverageDto,
  SavePlanTemplateDto,
  SuggestPlanDto,
  TrainingPlanResponseDto,
  UpdateTrainingPlanDto,
} from '../dto/training-plan.dto.js';
import type { TrainingPlan } from '../repositories/training-plan.repository.js';
import { SessionSchedulingService } from '../services/session-scheduling.service.js';
import { type ActingUser, TrainingPlanService } from '../services/training-plan.service.js';

const plans = new TrainingPlanService();
const learners = new LearnerService();
const sessionService = new SessionService();
const scheduling = new SessionSchedulingService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

async function toResponseDto(plan: TrainingPlan): Promise<TrainingPlanResponseDto> {
  const sessions = await scheduling.findSessionsByPlan(plan.id);
  const structures = await scheduling.toTemplateStructure(sessions);
  const contentIdsBySequence = new Map(structures.map((s) => [s.sequence, s.contentItemIds]));

  return {
    id: plan.id,
    learnerId: plan.learnerId,
    assignmentId: plan.assignmentId,
    title: plan.title,
    trainingDays: plan.trainingDays,
    language: plan.language,
    status: plan.status,
    startDate: plan.startDate.toISOString(),
    endDate: plan.endDate.toISOString(),
    createdById: plan.createdById,
    confirmedAt: plan.confirmedAt?.toISOString() ?? null,
    templateId: plan.templateId,
    sessions: sessions.map((session) => ({
      id: session.id,
      sequence: session.sequence,
      primaryOutcomeId: session.primaryOutcomeId,
      scheduledStart: session.scheduledStart.toISOString(),
      scheduledEnd: session.scheduledEnd.toISOString(),
      durationMinutes: session.durationMinutes,
      status: session.status,
      contentItemIds: contentIdsBySequence.get(session.sequence) ?? [],
    })),
  };
}

export class TrainingPlanController {
  async create(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateTrainingPlanDto;
    const plan = await plans.create(toActingUser(req.auth!), dto);
    res.status(201).json(await toResponseDto(plan));
  }

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const plan = await plans.getById(id);
    res.status(200).json(await toResponseDto(plan));
  }

  /** GET /learners/:id/active-plan — 200 with null body if the learner has no editable plan. */
  async getActiveByLearner(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const plan = await plans.getActiveByLearner(id);
    res.status(200).json(plan ? await toResponseDto(plan) : null);
  }

  /**
   * POST /learners/:id/deactivate — `TM-05`.
   *
   * Owned by this controller rather than `LearnerController` because
   * deactivation has to withdraw the learner from active training first, and
   * that needs `training-plans`/`sessions`; `learners` can't import either
   * without closing a module cycle (see `createLearnerDeactivationRouter`).
   *
   * Order is deliberate: the cascade runs BEFORE the status flip. If it
   * throws, the request fails and the learner stays ACTIVE — recoverable and
   * visible. Flipping first and then failing would leave an INACTIVE learner
   * holding live Teams meetings with nothing in the UI to show it.
   *
   * Idempotent: an already-INACTIVE learner skips the cascade and returns
   * unchanged, matching `LearnerService.deactivate`'s own early return.
   */
  async deactivateLearner(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const actor = toActingUser(req.auth!);

    // Resolves and tenant-scopes the learner before anything is cancelled —
    // an unknown id must 404 rather than half-execute the cascade.
    const existing = await learners.getById(id);

    if (existing.status !== 'INACTIVE') {
      await plans.withdrawLearnerFromTraining(actor, id);
      // Sweeps sessions the plan cancellation didn't reach — a session can
      // outlive its plan, and one with a live `graphEventId` would otherwise
      // keep a Teams meeting on the calendar.
      await sessionService.cancelAllForLearner(actor, id);
    }

    const learner = await learners.deactivate(actor, id);
    res.status(200).json(await toLearnerResponseDto(learner));
  }

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateTrainingPlanDto;
    const plan = await plans.update(toActingUser(req.auth!), id, dto);
    res.status(200).json(await toResponseDto(plan));
  }

  async suggest(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as SuggestPlanDto;
    const plan = await plans.suggest(toActingUser(req.auth!), id, dto.sessionDurationMinutes);
    res.status(200).json(await toResponseDto(plan));
  }

  async coverage(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const coverage: PlanCoverageDto = await plans.getCoverage(id);
    res.status(200).json(coverage);
  }

  async confirm(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const plan = await plans.confirm(toActingUser(req.auth!), id);
    res.status(200).json(await toResponseDto(plan));
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const plan = await plans.cancel(toActingUser(req.auth!), id);
    res.status(200).json(await toResponseDto(plan));
  }

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await plans.remove(toActingUser(req.auth!), id);
    res.status(204).send();
  }

  async saveAsTemplate(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as SavePlanTemplateDto;
    const template = await plans.saveAsTemplate(toActingUser(req.auth!), id, dto.name);
    res.status(201).json(template);
  }

  async listTemplates(req: Request, res: Response): Promise<void> {
    const { trackId, levelId } = req.query as { trackId: string; levelId: string };
    const templates = await plans.listTemplates(trackId, levelId);
    res.status(200).json({ data: templates, pageInfo: { nextCursor: null, hasNextPage: false } });
  }

  /**
   * `RP-05` — end-of-plan summary report, one PDF per distinct recipient
   * language among {manager, learner} (`RP-02`'s rule extends to plans).
   */
  async summaryReport(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const auth = req.auth!;
    const plan = await plans.getById(id);

    const learner = await learnerRepository.findByIdScoped(plan.learnerId);
    if (!learner) throw new Error('Learner not found for plan');

    const team = await teamRepository.findByIdScoped(learner.teamId);
    const manager = team?.managerId
      ? await portalUserRepository.findByIdScoped(team.managerId)
      : null;

    const recipientsByLanguage = new Map<'EN' | 'AR', PlanSummaryRecipient[]>();
    const addRecipient = (language: 'EN' | 'AR', recipient: PlanSummaryRecipient): void => {
      const existing = recipientsByLanguage.get(language) ?? [];
      existing.push(recipient);
      recipientsByLanguage.set(language, existing);
    };

    addRecipient(learner.preferredLanguage, {
      role: 'LEARNER',
      email: learner.email,
      name: learner.displayName,
    });
    if (manager) {
      addRecipient(manager.locale, {
        role: 'DEPARTMENT_MANAGER',
        portalUserId: manager.id,
        email: manager.email,
        name: manager.name,
      });
    }

    const created = await createPlanSummaryReports(auth.orgId, id, recipientsByLanguage);

    await writeAuditLog({
      organizationId: auth.orgId,
      actorId: auth.sub,
      actorType: 'USER',
      action: 'report.plan_summary_requested',
      entityType: 'TrainingPlan',
      entityId: id,
    });

    res.status(202).json({ data: created.map((r) => ({ id: r.id, language: r.language })) });
  }
}
