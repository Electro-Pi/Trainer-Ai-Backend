import { openApiRegistry } from '@/swagger/swagger.js';

import {
  createDraftAiTrainerRouter,
  createExternalSessionsRouter,
  createSkillAiTrainerRouter,
  createTrackAiTrainerRouter,
} from './ai-trainer.routes.js';
import { AiTrainerClientService } from './services/ai-trainer-client.service.js';

export const trackAiTrainerRouter = createTrackAiTrainerRouter();
export const skillAiTrainerRouter = createSkillAiTrainerRouter();
export const externalSessionsRouter = createExternalSessionsRouter();
export const draftAiTrainerRouter = createDraftAiTrainerRouter();

export type {
  SessionEvaluationManagerView,
  SessionEvaluationTraineeView,
  SessionTranscriptResponse,
} from './services/ai-trainer-client.types.js';

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `sessions`
// and `reports` resolve a session's transcript/evaluation through this
// instead of deep-importing `modules/ai-trainer/services/*`. `Session.id`
// resolves to the AI Trainer's own id via `Session.externalSessionId`
// (stamped by `queue/jobs/create-meeting.job.ts`) before either caller
// reaches this client.
export const aiTrainerClientService = new AiTrainerClientService();

openApiRegistry.registerPath({
  method: 'post',
  path: '/tracks/{trackId}/slides',
  tags: ['AI Trainer'],
  summary:
    'Generates one slide deck per skill in a track via the external AI Trainer service (blocking; DEPARTMENT_MANAGER, CONTENT_CREATOR, ADMIN)',
  responses: { 201: { description: 'Per-skill slide deck generation result' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/tracks/{trackId}/recommendations/skills',
  tags: ['AI Trainer'],
  summary: 'Advisory skill suggestions for a track from the external AI Trainer service',
  responses: { 200: { description: 'Suggested skills with rationale' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/skills/{skillId}/recommendations/outcomes',
  tags: ['AI Trainer'],
  summary: 'Advisory outcome suggestions for a skill from the external AI Trainer service',
  responses: { 200: { description: 'Suggested outcome strings' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/ai-trainer/recommendations/skills',
  tags: ['AI Trainer'],
  summary:
    'Draft-mode advisory skill suggestions for a track being composed in the creation wizard (no track id required)',
  responses: { 200: { description: 'Suggested skills with rationale' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/ai-trainer/recommendations/outcomes',
  tags: ['AI Trainer'],
  summary:
    'Draft-mode advisory outcome suggestions for a skill being composed in the creation wizard (no skill id required)',
  responses: { 200: { description: 'Suggested outcome strings' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/external-sessions',
  tags: ['AI Trainer'],
  summary:
    'Starts a live AI-trainer-bot session on an already-provisioned meeting link (blocking; DEPARTMENT_MANAGER, CONTENT_CREATOR, ADMIN)',
  responses: { 201: { description: 'Created external session' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/external-sessions/{id}',
  tags: ['AI Trainer'],
  summary: 'Live status/progress poll, proxied to the AI Trainer service',
  responses: { 200: { description: 'External session status' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/external-sessions/{id}/transcript',
  tags: ['AI Trainer'],
  summary: 'Live transcript, proxied to the AI Trainer service (never cached)',
  responses: { 200: { description: 'External session transcript' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/external-sessions/{id}/evaluation',
  tags: ['AI Trainer'],
  summary:
    'Live evaluation, proxied to the AI Trainer service (never cached; only available once the session has ended)',
  responses: { 200: { description: 'External session evaluation' } },
});
