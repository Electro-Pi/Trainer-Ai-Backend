-- SessionOutcome/SessionContent had no cascade on their Session FK, so
-- SessionSchedulingService.replaceSuggestedSessions()'s deleteByPlan() threw
-- a foreign-key-violation on any second suggest() call for a plan that
-- already had sessions (session_outcomes/session_contents rows still
-- referenced them). Both are pure scheduling metadata recreated fresh on
-- every suggest() call, so cascading their delete alongside the session is
-- safe -- unlike Invitation/Assessment/Report, which stay RESTRICT since
-- those are real records tied to a session that actually happened.

ALTER TABLE "session_outcomes" DROP CONSTRAINT "session_outcomes_sessionId_fkey";
ALTER TABLE "session_outcomes" ADD CONSTRAINT "session_outcomes_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "session_contents" DROP CONSTRAINT "session_contents_sessionId_fkey";
ALTER TABLE "session_contents" ADD CONSTRAINT "session_contents_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
