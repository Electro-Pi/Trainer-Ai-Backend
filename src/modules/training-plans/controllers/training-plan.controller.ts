import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

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
}
