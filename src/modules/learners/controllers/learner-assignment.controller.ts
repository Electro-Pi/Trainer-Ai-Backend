import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  AssignLearnerDto,
  LearnerOutcomeResponseDto,
  PatchLearnerOutcomesDto,
} from '../dto/learner.dto.js';
import type { LearnerOutcome } from '../repositories/learner-outcome.repository.js';
import {
  LearnerAssignmentService,
  type ActingUser,
} from '../services/learner-assignment.service.js';

const service = new LearnerAssignmentService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toOutcomeResponseDto(outcome: LearnerOutcome): LearnerOutcomeResponseDto {
  return {
    id: outcome.id,
    learnerId: outcome.learnerId,
    outcomeId: outcome.outcomeId,
    assignmentId: outcome.assignmentId,
    status: outcome.status,
    priority: outcome.priority,
    isCustom: outcome.isCustom,
    attemptCount: outcome.attemptCount,
    lastScore: outcome.lastScore,
    achievedAt: outcome.achievedAt?.toISOString() ?? null,
  };
}

export class LearnerAssignmentController {
  async assign(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as AssignLearnerDto;
    const result = await service.assign(toActingUser(req.auth!), id, dto);
    res.status(201).json({
      assignmentId: result.assignment.id,
      trackId: result.assignment.trackId,
      levelId: result.assignment.levelId,
      assignedAt: result.assignment.assignedAt.toISOString(),
      outcomes: result.outcomes.map(toOutcomeResponseDto),
    });
  }

  async getOutcomeMap(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const { status } = req.query as { status?: LearnerOutcome['status'] };
    const outcomes = await service.getOutcomeMap(id, status);
    res.status(200).json({ data: outcomes.map(toOutcomeResponseDto) });
  }

  async patchOutcomes(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as PatchLearnerOutcomesDto;
    const outcomes = await service.patchOutcomes(toActingUser(req.auth!), id, dto);
    res.status(200).json({ data: outcomes.map(toOutcomeResponseDto) });
  }
}
