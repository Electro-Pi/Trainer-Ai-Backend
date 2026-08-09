import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';

import { createAuthedUser, createTestOrganization } from '../helpers/fixtures.js';

describe('smoke: harness boots a real app against real Postgres/Redis', () => {
  it('GET /health returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health/ready reports all dependencies passing', async () => {
    const app = createApp();
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
  });

  it('an authenticated request round-trips through a real DB', async () => {
    const org = await createTestOrganization();
    const { authHeader } = await createAuthedUser(org.id, 'ADMIN');
    const app = createApp();

    const res = await request(app).get('/api/v1/users').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('rejects a request with no bearer token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });
});
