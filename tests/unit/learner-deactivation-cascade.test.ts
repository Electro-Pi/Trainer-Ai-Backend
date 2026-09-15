import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `TM-05` — deactivating a learner must withdraw them from active training.
 * These cover the two things most likely to regress: that the cascade runs
 * BEFORE the status flip (so a failure can't strand an INACTIVE learner with
 * live Teams meetings), and that one failing plan/session doesn't abort the
 * rest of the withdrawal.
 */

const calls: string[] = [];

const getById = vi.fn();
const deactivate = vi.fn();
const withdrawLearnerFromTraining = vi.fn();
const cancelAllForLearner = vi.fn();
const toLearnerResponseDto = vi.fn(async (l: unknown) => l);

vi.mock('@/modules/learners/learners.module.js', () => ({
  LearnerService: class {
    getById = getById;
    deactivate = deactivate;
  },
  learnerRepository: { findByIdScoped: vi.fn() },
  toLearnerResponseDto,
}));
vi.mock('@/modules/sessions/sessions.module.js', () => ({
  SessionService: class {
    cancelAllForLearner = cancelAllForLearner;
  },
  sessionRepository: {},
  sessionOutcomeRepository: {},
  sessionContentRepository: {},
}));
vi.mock('@/modules/reports/reports.module.js', () => ({
  createPlanSummaryReports: vi.fn(),
}));
vi.mock('@/modules/teams/teams.module.js', () => ({ teamRepository: { findByIdScoped: vi.fn() } }));
vi.mock('@/modules/users/users.module.js', () => ({ portalUserRepository: {} }));
vi.mock('@/common/interceptors/audit.interceptor.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('@/modules/training-plans/services/training-plan.service.js', () => ({
  TrainingPlanService: class {
    withdrawLearnerFromTraining = withdrawLearnerFromTraining;
  },
}));

const { TrainingPlanController } =
  await import('@/modules/training-plans/controllers/training-plan.controller.js');

const controller = new TrainingPlanController();

function res() {
  const json = vi.fn();
  return { status: vi.fn(() => ({ json })), json } as never;
}

function req(id = 'learner-1') {
  return {
    params: { id },
    auth: { sub: 'user-1', orgId: 'org-1', role: 'ADMIN' },
  } as never;
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  getById.mockResolvedValue({ id: 'learner-1', status: 'ACTIVE' });
  deactivate.mockImplementation(async () => {
    calls.push('deactivate');
    return { id: 'learner-1', status: 'INACTIVE' };
  });
  withdrawLearnerFromTraining.mockImplementation(async () => {
    calls.push('withdrawPlans');
    return { cancelledPlanIds: ['plan-1'], retiredAssignmentCount: 1 };
  });
  cancelAllForLearner.mockImplementation(async () => {
    calls.push('cancelSessions');
    return ['sess-1'];
  });
});

describe('POST /learners/:id/deactivate — training withdrawal cascade', () => {
  it('cancels plans and sessions BEFORE flipping the learner to INACTIVE', async () => {
    await controller.deactivateLearner(req(), res());

    expect(calls).toEqual(['withdrawPlans', 'cancelSessions', 'deactivate']);
  });

  it('leaves the learner ACTIVE when the plan cascade fails', async () => {
    withdrawLearnerFromTraining.mockRejectedValue(new Error('graph down'));

    await expect(controller.deactivateLearner(req(), res())).rejects.toThrow('graph down');
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('leaves the learner ACTIVE when the session sweep fails', async () => {
    cancelAllForLearner.mockRejectedValue(new Error('graph down'));

    await expect(controller.deactivateLearner(req(), res())).rejects.toThrow('graph down');
    expect(deactivate).not.toHaveBeenCalled();
  });

  it('is idempotent — an already-INACTIVE learner skips the cascade', async () => {
    getById.mockResolvedValue({ id: 'learner-1', status: 'INACTIVE' });

    await controller.deactivateLearner(req(), res());

    expect(withdrawLearnerFromTraining).not.toHaveBeenCalled();
    expect(cancelAllForLearner).not.toHaveBeenCalled();
    expect(deactivate).toHaveBeenCalledOnce();
  });

  it('404s on an unknown learner without cancelling anything', async () => {
    getById.mockRejectedValue(new Error('Learner not found'));

    await expect(controller.deactivateLearner(req('nope'), res())).rejects.toThrow(
      'Learner not found',
    );
    expect(withdrawLearnerFromTraining).not.toHaveBeenCalled();
    expect(cancelAllForLearner).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });
});
