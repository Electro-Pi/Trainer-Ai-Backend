import { beforeEach, describe, expect, it, vi } from 'vitest';

const findStuckExternalSessions = vi.fn();
const getSessionStatus = vi.fn();
const getSessionEvaluation = vi.fn();
const getSessionTranscript = vi.fn();
const complete = vi.fn();
const captureException = vi.fn();

vi.mock('@/modules/sessions/sessions.module.js', () => ({
  sessionRepository: { findStuckExternalSessions },
}));
vi.mock('@/modules/ai-trainer/ai-trainer.module.js', () => ({
  aiTrainerClientService: { getSessionStatus, getSessionEvaluation, getSessionTranscript },
}));
vi.mock('@/modules/ai-trainer/services/external-session-complete.service.js', () => ({
  ExternalSessionCompleteService: class {
    complete = complete;
  },
}));
vi.mock('@/config/container.js', () => ({
  container: { resolveErrorTracker: () => ({ captureException }) },
}));
vi.mock('@/logger/logger.service.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { processReconcileExternalSessionsJob } =
  await import('@/queue/jobs/reconcile-external-sessions.job.js');

const STUCK = { id: 'sess-1', organizationId: 'org-1', externalSessionId: 'ext-1' };

function evaluation() {
  return {
    session_id: 'ext-1',
    trainee_view: { overall_score: 80, passed: true },
    manager_view: null,
  };
}

describe('reconcile-external-sessions (rule: a lost webhook must never leave a session silently incomplete)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findStuckExternalSessions.mockResolvedValue([STUCK]);
    getSessionTranscript.mockResolvedValue({ turns: [] });
  });

  it('completes a session whose webhook never arrived but whose evaluation exists', async () => {
    getSessionStatus.mockResolvedValue({ status: 'completed', ended_at: 'x' });
    getSessionEvaluation.mockResolvedValue(evaluation());

    await processReconcileExternalSessionsJob();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toBe('ext-1');
    expect(captureException).not.toHaveBeenCalled();
  });

  // The exact failure that cost a real session its report: the AI Trainer
  // ended the meeting but generated no evaluation, so there is nothing to
  // complete the session with and no report can ever be produced.
  it('reports an ended session that has no evaluation instead of completing it', async () => {
    getSessionStatus.mockResolvedValue({ status: 'completed', ended_at: 'x' });
    getSessionEvaluation.mockRejectedValue(new Error('404 Not found'));

    await processReconcileExternalSessionsJob();

    expect(complete).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('leaves a session the AI Trainer still reports as running alone', async () => {
    getSessionStatus.mockResolvedValue({ status: 'in_progress' });

    await processReconcileExternalSessionsJob();

    expect(getSessionEvaluation).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('still completes when the transcript read fails — transcript is optional, the report is not', async () => {
    getSessionStatus.mockResolvedValue({ status: 'completed', ended_at: 'x' });
    getSessionEvaluation.mockResolvedValue(evaluation());
    getSessionTranscript.mockRejectedValue(new Error('boom'));

    await processReconcileExternalSessionsJob();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[1]).not.toHaveProperty('transcript');
  });

  it('one unreachable session does not abort the sweep', async () => {
    const second = { id: 'sess-2', organizationId: 'org-1', externalSessionId: 'ext-2' };
    findStuckExternalSessions.mockResolvedValue([STUCK, second]);
    getSessionStatus
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: 'completed', ended_at: 'x' });
    getSessionEvaluation.mockResolvedValue(evaluation());

    await processReconcileExternalSessionsJob();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[0]).toBe('ext-2');
  });

  it('does nothing when no session is stuck', async () => {
    findStuckExternalSessions.mockResolvedValue([]);

    await processReconcileExternalSessionsJob();

    expect(getSessionStatus).not.toHaveBeenCalled();
  });
});
