import { openApiRegistry } from '@/swagger/swagger.js';

import { createAgentRouter } from './agent.routes.js';
import {
  registerOutcomeEscalationHandler,
  registerSessionCompletedHandlers,
} from './services/session-completed-handlers.js';

export const agentRouter = createAgentRouter();

// Sanctioned cross-module surface — the AI Trainer webhook flow
// (`external-session-complete.service.ts`) shares this exact
// outcome-tracking/escalation behavior with `CompleteSessionService`'s
// rubric-scored completion path.
export { updateLearnerOutcomes } from './services/update-learner-outcomes.js';

// `P8-8b` — subscribes `session.completed`/`outcome.failed.repeatedly` at
// module load, the same way `recommendations.module.ts` wires `RC-01`'s
// `LEVEL_ASSIGNED` subscriber. Must be imported (for its router) before
// `app.ts` mounts `/agent`, guaranteeing the subscription is live before any
// request can publish either event.
registerSessionCompletedHandlers();
registerOutcomeEscalationHandler();

openApiRegistry.registerPath({
  method: 'get',
  path: '/agent/sessions/{joinToken}/context',
  tags: ['Agent API'],
  summary:
    '🤖 Service-token — learner profile, outcomes (incl. carried-over), ordered content + media SAS URLs, question bank, rubric (`LS-02`…`LS-04`, `CM-06`)',
  responses: { 200: { description: 'Session context' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/content/{contentId}/delivered',
  tags: ['Agent API'],
  summary: '🤖 Marks a session content item as delivered (feeds `RC-14`, `PF-07`)',
  responses: { 204: { description: 'Marked delivered' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/start',
  tags: ['Agent API'],
  summary: '🤖 Marks a session `IN_PROGRESS`',
  responses: { 200: { description: 'Session status' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/answers',
  tags: ['Agent API'],
  summary: '🤖 Persists an answer with per-criterion judgements (`LS-05`, `LS-06`)',
  responses: { 201: { description: 'Accepted' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/remediation',
  tags: ['Agent API'],
  summary: '🤖 In-session remedial content for a failed check, < 2s (`RC-07`)',
  responses: { 200: { description: 'Remedial content items' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/notes',
  tags: ['Agent API'],
  summary: '🤖 Strengths/gaps/agent notes for the session (`LS-07`)',
  responses: { 201: { description: 'Accepted' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/transcript',
  tags: ['Agent API'],
  summary: '🤖 Transcript + recording consent flag (`LS-10`, NFR *Privacy*)',
  responses: { 201: { description: 'Accepted' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/agent/sessions/{id}/complete',
  tags: ['Agent API'],
  summary:
    '🤖 The §9.1 transaction: weighted rubric score → verdict → outcome update → carry-over → report + next recommendation queued (`LS-08`)',
  responses: { 200: { description: 'Verdict and score' } },
});
