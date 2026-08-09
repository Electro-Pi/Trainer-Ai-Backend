import { openApiRegistry } from '@/swagger/swagger.js';

import { PlanTemplateRepository } from './repositories/plan-template.repository.js';
import { TrainingPlanRepository } from './repositories/training-plan.repository.js';
import { createTrainingPlansRouter } from './training-plans.routes.js';

export type { TrainingPlan } from './repositories/training-plan.repository.js';
export type { PlanTemplate } from './repositories/plan-template.repository.js';

export const trainingPlansRouter = createTrainingPlansRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `sessions`
// (reschedule/cancel/attendance) resolves a session's plan through this
// instead of deep-importing `modules/training-plans/repositories/*`.
export const trainingPlanRepository = new TrainingPlanRepository();
export const planTemplateRepository = new PlanTemplateRepository();

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans',
  tags: ['Training Plans'],
  summary: 'Creates a DRAFT training plan for a learner’s active assignment (`TP-01`)',
  responses: { 201: { description: 'Created plan' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/templates',
  tags: ['Training Plans'],
  summary: 'Lists reusable plan templates for a track/level (`TP-07`)',
  responses: { 200: { description: 'Template list' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/{id}',
  tags: ['Training Plans'],
  summary: 'Gets a training plan with its sessions',
  responses: { 200: { description: 'Training plan' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/plans/{id}',
  tags: ['Training Plans'],
  summary: 'Updates a DRAFT plan’s title/days/dates',
  responses: { 200: { description: 'Updated plan' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/suggest',
  tags: ['Training Plans'],
  summary: 'Proposes a session breakdown from the level via `PLAN_BUILD` (`TP-05`)',
  responses: { 200: { description: 'Plan with suggested sessions' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/{id}/coverage',
  tags: ['Training Plans'],
  summary: 'Validates every required outcome is covered by a session, flags gaps (`TP-04`)',
  responses: { 200: { description: 'Coverage report' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/confirm',
  tags: ['Training Plans'],
  summary: 'Confirms a DRAFT plan and enqueues Teams meeting creation per session',
  responses: { 200: { description: 'Confirmed plan' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/cancel',
  tags: ['Training Plans'],
  summary: 'Cancels a plan',
  responses: { 200: { description: 'Cancelled plan' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/save-as-template',
  tags: ['Training Plans'],
  summary: 'Saves a plan’s session structure as a reusable template (`TP-07`)',
  responses: { 201: { description: 'Created template' } },
});
