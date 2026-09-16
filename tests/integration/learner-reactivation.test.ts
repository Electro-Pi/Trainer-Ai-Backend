import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

import {
  createAuthedUser,
  createLearner,
  createTeam,
  createTestOrganization,
  resetRateLimits,
} from '../helpers/fixtures.js';

const app = createApp();

describe('POST /learners/:id/reactivate', () => {
  it('restores an inactive member to active status', async () => {
    await resetRateLimits();
    const organization = await createTestOrganization('Learner Reactivation');
    const { user: manager, authHeader } = await createAuthedUser(
      organization.id,
      'DEPARTMENT_MANAGER',
    );
    const team = await createTeam(organization.id, manager.id);
    const learner = await createLearner(organization.id, team.id);

    await runWithTenant(organization.id, () =>
      prisma.learner.update({
        where: { id: learner.id },
        data: { status: 'INACTIVE', deactivatedAt: new Date() },
      }),
    );

    const response = await request(app)
      .post(`/api/v1/learners/${learner.id}/reactivate`)
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.deactivatedAt).toBeNull();
  });
});
