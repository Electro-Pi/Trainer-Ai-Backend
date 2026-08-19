import { openApiRegistry } from '@/swagger/swagger.js';

import { PlanContentMediaRepository } from './repositories/plan-content-media.repository.js';
import { PlanTemplateRepository } from './repositories/plan-template.repository.js';
import { PlanTrackSnapshotRepository } from './repositories/plan-track-snapshot.repository.js';
import { TrainingPlanRepository } from './repositories/training-plan.repository.js';
import {
  createLearnerActivePlanRouter,
  createTrainingPlansRouter,
} from './training-plans.routes.js';

export type { TrainingPlan } from './repositories/training-plan.repository.js';
export type { PlanTemplate } from './repositories/plan-template.repository.js';
export type { PlanContentMedia } from './repositories/plan-content-media.repository.js';
export type {
  PlanContentSnapshot,
  PlanLearnerOutcomeSnapshot,
  PlanOutcomeSnapshot,
  PlanSkillSnapshot,
  PlanTrackSnapshot,
  PlanTrackSnapshotTree,
} from './repositories/plan-track-snapshot.repository.js';

export const trainingPlansRouter = createTrainingPlansRouter();
export const learnerActivePlanRouter = createLearnerActivePlanRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `sessions`
// (reschedule/cancel/attendance) resolves a session's plan through this
// instead of deep-importing `modules/training-plans/repositories/*`.
// `recommendations` resolves a plan's track snapshot the same way, for the
// snapshot-aware recommendation branch.
export const trainingPlanRepository = new TrainingPlanRepository();
export const planTemplateRepository = new PlanTemplateRepository();
export const planTrackSnapshotRepository = new PlanTrackSnapshotRepository();
export const planContentMediaRepository = new PlanContentMediaRepository();

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
  path: '/plans/{id}/snapshot',
  tags: ['Training Plans'],
  summary:
    'Deep-copies the plan’s assigned track (skills/outcomes/content) into plan-scoped rows for editing',
  responses: { 201: { description: 'Created snapshot tree' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/{id}/snapshot',
  tags: ['Training Plans'],
  summary: 'Gets the plan’s track snapshot tree',
  responses: { 200: { description: 'Snapshot tree' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/snapshot/skills',
  tags: ['Training Plans'],
  summary: 'Adds a plan-scoped skill to the snapshot (no effect on the master catalogue)',
  responses: { 201: { description: 'Created skill snapshot' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/plans/{id}/snapshot/skills/{skillSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Updates a plan-scoped skill snapshot',
  responses: { 200: { description: 'Updated skill snapshot' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/plans/{id}/snapshot/skills/{skillSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Soft-removes a plan-scoped skill snapshot',
  responses: { 204: { description: 'Removed' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/snapshot/skills/{skillSnapshotId}/outcomes',
  tags: ['Training Plans'],
  summary: 'Adds a plan-scoped outcome under a skill snapshot',
  responses: { 201: { description: 'Created outcome snapshot' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/plans/{id}/snapshot/outcomes/{outcomeSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Updates a plan-scoped outcome snapshot',
  responses: { 200: { description: 'Updated outcome snapshot' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/plans/{id}/snapshot/outcomes/{outcomeSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Soft-removes a plan-scoped outcome snapshot',
  responses: { 204: { description: 'Removed' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/snapshot/content',
  tags: ['Training Plans'],
  summary: 'Adds plan-scoped content to the snapshot',
  responses: { 201: { description: 'Created content snapshot' } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/plans/{id}/snapshot/content/{contentSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Updates a plan-scoped content snapshot',
  responses: { 200: { description: 'Updated content snapshot' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/plans/{id}/snapshot/content/{contentSnapshotId}',
  tags: ['Training Plans'],
  summary: 'Soft-removes a plan-scoped content snapshot',
  responses: { 204: { description: 'Removed' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/plans/{id}/snapshot/content/{contentSnapshotId}/media',
  tags: ['Training Plans'],
  summary: 'Lists media uploaded to a plan-scoped content snapshot',
  responses: { 200: { description: 'Media list' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/snapshot/content/{contentSnapshotId}/media',
  tags: ['Training Plans'],
  summary:
    'Uploads a media asset to a plan-scoped content snapshot — magic-byte MIME sniff, malware scan, no effect on the master catalogue',
  responses: { 201: { description: 'Created plan content media, scan pending' } },
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

openApiRegistry.registerPath({
  method: 'post',
  path: '/plans/{id}/summary-report',
  tags: ['Reports'],
  summary: 'Requests an end-of-plan summary report, one PDF per recipient language (`RP-05`)',
  responses: { 202: { description: 'Report(s) queued for generation' } },
});
