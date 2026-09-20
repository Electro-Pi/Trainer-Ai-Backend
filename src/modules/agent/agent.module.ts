import {
  registerOutcomeEscalationHandler,
  registerSessionCompletedHandlers,
} from './services/session-completed-handlers.js';

// Sanctioned cross-module surface — the AI Trainer webhook flow
// (`external-session-complete.service.ts`) shares this exact
// outcome-tracking/escalation behavior with `CompleteSessionService`'s
// rubric-scored completion path.
export { updateLearnerOutcomes } from './services/update-learner-outcomes.js';

// `P8-8b` — subscribes `session.completed`/`outcome.failed.repeatedly` at
// module load, the same way `recommendations.module.ts` wires `RC-01`'s
// `LEVEL_ASSIGNED` subscriber.
//
// The `/agent/*` routes this module used to mount were removed (the AI team
// calls `POST /external-sessions/:id/complete` instead — see
// `session-complete-webhook-spec.html`), so `app.ts` no longer imports this
// file. The subscriptions now register when `external-session-complete.service`
// pulls in `updateLearnerOutcomes` above, which is on the completion path that
// publishes these events — still before either can fire.
registerSessionCompletedHandlers();
registerOutcomeEscalationHandler();
