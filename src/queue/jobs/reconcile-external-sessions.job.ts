import {
  EXTERNAL_SESSION_RECONCILE_BATCH_SIZE,
  EXTERNAL_SESSION_RECONCILE_GRACE_MINUTES,
} from '@/config/constants.js';
import { container } from '@/config/container.js';
import { logger } from '@/logger/logger.service.js';
import { aiTrainerClientService } from '@/modules/ai-trainer/ai-trainer.module.js';
import { ExternalSessionCompleteService } from '@/modules/ai-trainer/services/external-session-complete.service.js';
import { sessionRepository } from '@/modules/sessions/sessions.module.js';
import type { ErrorTracker } from '@/shared-types.js';

/** AI Trainer statuses that mean the meeting is over, however it ended. */
const ENDED_STATUSES = new Set(['completed', 'failed', 'abandoned']);

interface ReconcileTotals {
  checked: number;
  recovered: number;
  stillRunning: number;
  missingEvaluation: number;
  unreachable: number;
}

/**
 * Reconciles sessions the AI Trainer never told us about.
 *
 * The webhook (`POST /external-sessions/:id/complete`) is the only signal our
 * backend gets that a Teams-dispatched session ended — nothing here detects
 * meeting-end on its own. When it doesn't arrive, the `Session` stays at its
 * pre-meeting status, `session.completed` is never published, no `Report` row
 * is ever created, and neither the learner nor their manager is emailed. None
 * of that surfaces anywhere: the row is indistinguishable from a meeting still
 * to come.
 *
 * So this sweep asks the AI Trainer directly about every session whose meeting
 * should be well over, and splits the answer three ways:
 *
 *  - **ended, evaluation exists** — the webhook was simply lost. Replay it
 *    through `ExternalSessionCompleteService` (the same path the webhook
 *    itself takes, idempotent) and the report pipeline runs as normal.
 *  - **ended, no evaluation** — the AI Trainer never generated one, so there
 *    is nothing to complete the session *with*; no report can be produced by
 *    us or by them. Unrecoverable here by design: report it loudly instead of
 *    retrying something that will never succeed.
 *  - **still running / unreachable** — leave it alone. The next run re-checks
 *    it, and the real webhook may still land first.
 */
export async function processReconcileExternalSessionsJob(): Promise<void> {
  const cutoff = new Date(Date.now() - EXTERNAL_SESSION_RECONCILE_GRACE_MINUTES * 60 * 1000);
  const stuck = await sessionRepository.findStuckExternalSessions(
    cutoff,
    EXTERNAL_SESSION_RECONCILE_BATCH_SIZE,
  );

  if (stuck.length === 0) return;

  const completeService = new ExternalSessionCompleteService();
  const errorTracker = container.resolveErrorTracker<ErrorTracker>();
  const totals: ReconcileTotals = {
    checked: stuck.length,
    recovered: 0,
    stillRunning: 0,
    missingEvaluation: 0,
    unreachable: 0,
  };

  for (const session of stuck) {
    // One bad session must never abort the sweep — the next one may well be
    // recoverable, and this job has no retry (`retryLimit: 0`, cron-driven).
    try {
      const status = await aiTrainerClientService.getSessionStatus(session.externalSessionId);

      if (!ENDED_STATUSES.has(status.status)) {
        totals.stillRunning += 1;
        continue;
      }

      // Ended, but the AI Trainer may have no evaluation for it — a 404 here
      // is the one failure this job cannot repair (see the doc comment).
      let evaluation;
      try {
        evaluation = await aiTrainerClientService.getSessionEvaluation(session.externalSessionId);
      } catch {
        totals.missingEvaluation += 1;
        logger.error(
          {
            sessionId: session.id,
            externalSessionId: session.externalSessionId,
            aiTrainerStatus: status.status,
          },
          'reconcile: AI Trainer session ended with no evaluation — no report can be generated',
        );
        errorTracker.captureException(new Error('AI Trainer session ended without an evaluation'), {
          sessionId: session.id,
          externalSessionId: session.externalSessionId,
          aiTrainerStatus: status.status,
          endedAt: status.ended_at,
        });
        continue;
      }

      // Transcript is optional — `complete()` records an empty one when it is
      // absent, exactly as the webhook contract allows, so a failed
      // transcript read must not cost us the report.
      const transcript = await aiTrainerClientService
        .getSessionTranscript(session.externalSessionId)
        .catch(() => undefined);

      await completeService.complete(session.externalSessionId, {
        evaluation: {
          trainee_view: evaluation.trainee_view,
          manager_view: evaluation.manager_view,
        },
        ...(transcript ? { transcript: { turns: transcript.turns } } : {}),
      } as never);

      totals.recovered += 1;
      logger.warn(
        {
          sessionId: session.id,
          externalSessionId: session.externalSessionId,
          aiTrainerStatus: status.status,
        },
        'reconcile: completed a session whose AI Trainer webhook never arrived',
      );
    } catch (error) {
      totals.unreachable += 1;
      logger.warn(
        { sessionId: session.id, externalSessionId: session.externalSessionId, error },
        'reconcile: could not reach the AI Trainer for this session — will retry next run',
      );
    }
  }

  logger.info(totals, 'reconcile: external session sweep complete');
}
