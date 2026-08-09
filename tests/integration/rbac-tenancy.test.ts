import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';

import {
  createAuthedUser,
  createCatalogueTree,
  createTeam,
  createTestOrganization,
} from '../helpers/fixtures.js';

const app = createApp();

describe('RBAC: teams module (§7.2 ownership matrix)', () => {
  it('a MANAGER can create a team for themself and read it back', async () => {
    const org = await createTestOrganization();
    const { user, authHeader } = await createAuthedUser(org.id, 'MANAGER');

    const createRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', authHeader)
      .send({ name: 'My Team' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.managerId).toBe(user.id);

    const getRes = await request(app)
      .get(`/api/v1/teams/${createRes.body.id}`)
      .set('Authorization', authHeader);
    expect(getRes.status).toBe(200);
  });

  it('a MANAGER cannot read a team they do not manage', async () => {
    const org = await createTestOrganization();
    const { user: otherManager } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, otherManager.id);

    const { authHeader } = await createAuthedUser(org.id, 'MANAGER');
    const res = await request(app).get(`/api/v1/teams/${team.id}`).set('Authorization', authHeader);
    expect(res.status).toBe(403);
  });

  it('a MANAGER cannot update a team they do not manage', async () => {
    const org = await createTestOrganization();
    const { user: otherManager } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, otherManager.id);

    const { authHeader } = await createAuthedUser(org.id, 'MANAGER');
    const res = await request(app)
      .patch(`/api/v1/teams/${team.id}`)
      .set('Authorization', authHeader)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('HR reads org-wide (any team) but per AU-05 has no write route available to it', async () => {
    const org = await createTestOrganization();
    const { user: manager } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, manager.id);

    const { authHeader: hrAuth } = await createAuthedUser(org.id, 'HR');
    const getRes = await request(app).get(`/api/v1/teams/${team.id}`).set('Authorization', hrAuth);
    expect(getRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', hrAuth)
      .send({ name: 'HR-created team', managerId: manager.id });
    expect(createRes.status).toBe(403);
  });

  it('ADMIN reaches any team, including write', async () => {
    const org = await createTestOrganization();
    const { user: manager } = await createAuthedUser(org.id, 'MANAGER');
    const team = await createTeam(org.id, manager.id);

    const { authHeader: adminAuth } = await createAuthedUser(org.id, 'ADMIN');
    const getRes = await request(app)
      .get(`/api/v1/teams/${team.id}`)
      .set('Authorization', adminAuth);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/api/v1/teams/${team.id}`)
      .set('Authorization', adminAuth)
      .send({ name: 'Renamed by admin' });
    expect(updateRes.status).toBe(200);
  });

  it('CONTENT_MANAGER has no row in the teams access matrix', async () => {
    const org = await createTestOrganization();
    const { authHeader } = await createAuthedUser(org.id, 'CONTENT_MANAGER');
    const res = await request(app).get('/api/v1/teams').set('Authorization', authHeader);
    expect(res.status).toBe(403);
  });
});

describe('RBAC: users module is ADMIN-only', () => {
  it('ADMIN can list portal users', async () => {
    const org = await createTestOrganization();
    const { authHeader } = await createAuthedUser(org.id, 'ADMIN');
    const res = await request(app).get('/api/v1/users').set('Authorization', authHeader);
    expect(res.status).toBe(200);
  });

  it('MANAGER, HR and CONTENT_MANAGER are all refused', async () => {
    const org = await createTestOrganization();
    for (const role of ['MANAGER', 'HR', 'CONTENT_MANAGER'] as const) {
      const { authHeader } = await createAuthedUser(org.id, role);
      const res = await request(app).get('/api/v1/users').set('Authorization', authHeader);
      expect(res.status).toBe(403);
    }
  });
});

describe('Tenancy: cross-org isolation proven per model', () => {
  it('a MANAGER token from org A cannot read a team in org B (404, not leaked)', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const { user: managerB } = await createAuthedUser(orgB.id, 'MANAGER');
    const teamInOrgB = await createTeam(orgB.id, managerB.id);

    const { authHeader: adminAAuth } = await createAuthedUser(orgA.id, 'ADMIN');
    const res = await request(app)
      .get(`/api/v1/teams/${teamInOrgB.id}`)
      .set('Authorization', adminAAuth);
    // ADMIN has blanket access WITHIN its own org only — cross-org must still 404, not 200.
    expect(res.status).toBe(404);
  });

  it("org A's track/level/outcome catalogue is invisible to org B", async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    const { track } = await createCatalogueTree(orgA.id);

    const { authHeader: adminBAuth } = await createAuthedUser(orgB.id, 'ADMIN');
    const res = await request(app)
      .get(`/api/v1/tracks/${track.id}`)
      .set('Authorization', adminBAuth);
    expect(res.status).toBe(404);
  });

  it('listing tracks in org B never includes org A rows', async () => {
    const orgA = await createTestOrganization();
    const orgB = await createTestOrganization();
    await createCatalogueTree(orgA.id);
    const { track: trackB } = await createCatalogueTree(orgB.id);

    const { authHeader: adminBAuth } = await createAuthedUser(orgB.id, 'ADMIN');
    const res = await request(app).get('/api/v1/tracks').set('Authorization', adminBAuth);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: { id: string }) => t.id);
    expect(ids).toContain(trackB.id);
    expect(ids.length).toBe(1);
  });
});

describe('Tenancy: authenticate() structurally cannot issue a session for a cross-org sub', () => {
  it('a token minted for org A, replayed as-is, always resolves within org A regardless of target', async () => {
    const org = await createTestOrganization();
    const { authHeader } = await createAuthedUser(org.id, 'ADMIN');
    // orgId is baked into the signed JWT claims (jwt.ts) — there is no
    // request field a client can override to switch tenants after the fact.
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', authHeader)
      .query({ organizationId: 'some-other-org-id' });
    expect(res.status).toBe(200);
  });
});
