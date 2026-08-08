import type { Request, Response } from 'express';

import type { AuthContext } from '@/common/types/express.js';

import type {
  CreateQuestionDto,
  QuestionBankResponseDto,
  QuestionDto,
  RubricCriterionDto,
  RubricResponseDto,
  UpdateQuestionDto,
  UpsertQuestionBankDto,
  UpsertRubricDto,
} from '../dto/assessment.dto.js';
import type { Question } from '../repositories/question.repository.js';
import {
  AssessmentService,
  type ActingUser,
  type QuestionBankWithQuestions,
  type RubricWithCriteria,
} from '../services/assessment.service.js';

const service = new AssessmentService();

function toActingUser(auth: AuthContext): ActingUser {
  return { id: auth.sub, organizationId: auth.orgId, role: auth.role };
}

function toQuestionDto(q: Question): QuestionDto {
  return {
    id: q.id,
    prompt: q.prompt,
    difficulty: q.difficulty,
    expectedAnswer: q.expectedAnswer,
    modelAnswer: q.modelAnswer,
    order: q.order,
  };
}

function toQuestionBankResponseDto({
  bank,
  questions,
}: QuestionBankWithQuestions): QuestionBankResponseDto {
  return {
    id: bank.id,
    outcomeId: bank.outcomeId,
    language: bank.language,
    isActive: bank.isActive,
    questions: questions.map(toQuestionDto),
  };
}

function toRubricResponseDto({ rubric, criteria }: RubricWithCriteria): RubricResponseDto {
  return {
    id: rubric.id,
    outcomeId: rubric.outcomeId,
    name: rubric.name,
    passThreshold: rubric.passThreshold,
    isActive: rubric.isActive,
    criteria: criteria.map((c): RubricCriterionDto => ({
      id: c.id,
      label: c.label,
      description: c.description,
      weight: c.weight,
      order: c.order,
    })),
  };
}

export class AssessmentController {
  async getQuestionBank(req: Request, res: Response): Promise<void> {
    const { id: outcomeId } = req.params as { id: string };
    const { language } = req.query as { language: 'EN' | 'AR' };
    const result = await service.getQuestionBank(outcomeId, language);
    res.status(200).json(toQuestionBankResponseDto(result));
  }

  async upsertQuestionBank(req: Request, res: Response): Promise<void> {
    const { id: outcomeId } = req.params as { id: string };
    const dto = req.body as UpsertQuestionBankDto;
    const result = await service.upsertQuestionBank(toActingUser(req.auth!), outcomeId, dto);
    res.status(200).json(toQuestionBankResponseDto(result));
  }

  async createQuestion(req: Request, res: Response): Promise<void> {
    const dto = req.body as CreateQuestionDto;
    const question = await service.createQuestion(toActingUser(req.auth!), dto);
    res.status(201).json(toQuestionDto(question));
  }

  async updateQuestion(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const dto = req.body as UpdateQuestionDto;
    const question = await service.updateQuestion(toActingUser(req.auth!), id, dto);
    res.status(200).json(toQuestionDto(question));
  }

  async deleteQuestion(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await service.deleteQuestion(toActingUser(req.auth!), id);
    res.status(204).send();
  }

  async getRubric(req: Request, res: Response): Promise<void> {
    const { id: outcomeId } = req.params as { id: string };
    const result = await service.getRubric(outcomeId);
    res.status(200).json(toRubricResponseDto(result));
  }

  async upsertRubric(req: Request, res: Response): Promise<void> {
    const { id: outcomeId } = req.params as { id: string };
    const dto = req.body as UpsertRubricDto;
    const result = await service.upsertRubric(toActingUser(req.auth!), outcomeId, dto);
    res.status(200).json(toRubricResponseDto(result));
  }
}
