import { openApiRegistry } from '@/swagger/swagger.js';

import { createOutcomeAssessmentsRouter, createQuestionsRouter } from './assessments.routes.js';
import { AssessmentAnswerRepository } from './repositories/assessment-answer.repository.js';
import { AssessmentRepository } from './repositories/assessment.repository.js';
import { QuestionBankRepository } from './repositories/question-bank.repository.js';
import { QuestionRepository } from './repositories/question.repository.js';
import { RubricCriterionRepository } from './repositories/rubric-criterion.repository.js';
import { RubricRepository } from './repositories/rubric.repository.js';

export type { Assessment } from './repositories/assessment.repository.js';
export type { QuestionBank } from './repositories/question-bank.repository.js';
export type { Question } from './repositories/question.repository.js';
export type { Rubric } from './repositories/rubric.repository.js';
export type { RubricCriterion } from './repositories/rubric-criterion.repository.js';

export const outcomeAssessmentsRouter = createOutcomeAssessmentsRouter();
export const questionsRouter = createQuestionsRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `agent` (P8)
// reads question banks/rubrics for session context and writes
// assessments/answers on completion through these instead of deep-importing
// `modules/assessments/repositories/*`.
export const assessmentRepository = new AssessmentRepository();
export const assessmentAnswerRepository = new AssessmentAnswerRepository();
export const questionBankRepository = new QuestionBankRepository();
export const questionRepository = new QuestionRepository();
export const rubricRepository = new RubricRepository();
export const rubricCriterionRepository = new RubricCriterionRepository();

openApiRegistry.registerPath({
  method: 'get',
  path: '/outcomes/{id}/question-bank',
  tags: ['Assessments'],
  summary: 'Gets the question bank for an outcome/language (`CM-10`)',
  responses: { 200: { description: 'Question bank' } },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/outcomes/{id}/question-bank',
  tags: ['Assessments'],
  summary: 'Replaces the question bank for an outcome/language (`CM-10`)',
  responses: { 200: { description: 'Updated question bank' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/questions',
  tags: ['Assessments'],
  summary: 'Adds a single question to an existing question bank',
  responses: { 201: { description: 'Created question' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/questions/{id}',
  tags: ['Assessments'],
  summary: 'Updates a single question',
  responses: { 200: { description: 'Updated question' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/questions/{id}',
  tags: ['Assessments'],
  summary: 'Deletes a single question',
  responses: { 204: { description: 'Deleted' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/outcomes/{id}/rubric',
  tags: ['Assessments'],
  summary: 'Gets the active rubric for an outcome (`CM-11`)',
  responses: { 200: { description: 'Rubric' } },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/outcomes/{id}/rubric',
  tags: ['Assessments'],
  summary: 'Replaces the rubric for an outcome — criteria weights must sum to 100 (`CM-11`)',
  responses: { 200: { description: 'Updated rubric' } },
});
