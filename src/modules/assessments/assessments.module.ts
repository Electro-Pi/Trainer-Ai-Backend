import { openApiRegistry } from '@/swagger/swagger.js';

import { createOutcomeAssessmentsRouter, createQuestionsRouter } from './assessments.routes.js';

export const outcomeAssessmentsRouter = createOutcomeAssessmentsRouter();
export const questionsRouter = createQuestionsRouter();

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
