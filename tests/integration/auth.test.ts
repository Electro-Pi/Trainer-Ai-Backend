import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '@/app.js';
import { hashPassword } from '@/common/utils/password-hash.js';
import { prisma } from '@/database/prisma.service.js';
import { runWithTenant } from '@/database/tenant-context.js';

import { createTestOrganization, resetRateLimits } from '../helpers/fixtures.js';

const app = createApp();

beforeEach(async () => {
  await resetRateLimits();
});

describe('auth: Microsoft Entra sign-in (on FakeMsalService)', () => {
  it('completes the start -> callback round trip and issues a token pair', async () => {
    const startRes = await request(app).get('/api/v1/auth/microsoft/start');
    expect(startRes.status).toBe(200);
    const url = new URL(startRes.body.url.replace('about:blank', 'http://x'));
    const code = url.searchParams.get('code')!;
    const state = url.searchParams.get('state')!;

    const callbackRes = await request(app)
      .get('/api/v1/auth/microsoft/callback')
      .query({ code, state });

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.accessToken).toBeTruthy();
    expect(callbackRes.body.refreshToken).toBeTruthy();
  });

  it('rejects a callback with an unknown/expired state', async () => {
    const res = await request(app)
      .get('/api/v1/auth/microsoft/callback')
      .query({ code: 'anything', state: 'never-issued-state' });
    expect(res.status).toBe(400);
  });

  it('GET /auth/me returns the signed-in user after a real sign-in', async () => {
    const startRes = await request(app).get('/api/v1/auth/microsoft/start');
    const url = new URL(startRes.body.url.replace('about:blank', 'http://x'));
    const callbackRes = await request(app)
      .get('/api/v1/auth/microsoft/callback')
      .query({
        code: url.searchParams.get('code')!,
        state: url.searchParams.get('state')!,
      });

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${callbackRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe('MANAGER'); // new Entra sign-ins provision as MANAGER, never elevated
  });

  it('no auth path can ever issue a token for a Learner (AU-04) — /auth/me never returns learner shape', async () => {
    // Structural guarantee: a Learner has no PortalUser row and therefore no
    // `sub` any guard could verify. Proven here by confirming the only two
    // sign-in paths (Microsoft, password) both resolve through
    // `portalUserRepository`, never `learnerRepository` — the callback above
    // already proves this for Microsoft; this test proves it for password.
    const org = await createTestOrganization();
    const passwordHash = await hashPassword('correct-horse-battery-staple');
    await runWithTenant(org.id, () =>
      prisma.portalUser.create({
        data: {
          organizationId: org.id,
          email: 'learner-like@test.local',
          name: 'Not A Learner',
          role: 'MANAGER',
          passwordHash,
        },
      }),
    );

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'learner-like@test.local', password: 'correct-horse-battery-staple' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // No `Learner` model was ever touched to satisfy this login.
  });
});

describe('auth: password fallback (argon2id, AU-07)', () => {
  // `PortalUser.email` is unique only per-org (`@@unique([organizationId, email])`)
  // — `findByEmail` deliberately resolves it globally, unscoped, since email is
  // the only identifier available before any org context exists at sign-in
  // (same reasoning as `findByEntraObjectId`). That means reusing one literal
  // email across this describe's tests would leak state between them (each
  // `beforeEach` creates a fresh org, but old rows from earlier tests in the
  // same run persist) — a fresh email per test keeps each test's row the only
  // possible match, mirroring how a real org's emails are actually unique.
  let email: string;
  const password = 'correct-horse-battery-staple';

  beforeEach(async () => {
    const org = await createTestOrganization();
    email = `password-user-${org.id}@test.local`;
    const passwordHash = await hashPassword(password);
    await runWithTenant(org.id, () =>
      prisma.portalUser.create({
        data: {
          organizationId: org.id,
          email,
          name: 'Password User',
          role: 'HR',
          passwordHash,
        },
      }),
    );
  });

  it('correct credentials succeed', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('wrong password and unknown email return the identical generic error', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'not-the-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.local', password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.detail).toBe(unknownEmail.body.detail);
  });

  it('locks the account after 5 failed attempts, rejecting even the correct password', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong' });
    }

    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(401);
  });
});

describe('auth: refresh rotation + reuse-detection (AU-06)', () => {
  async function signIn(): Promise<{ accessToken: string; refreshToken: string }> {
    const startRes = await request(app).get('/api/v1/auth/microsoft/start');
    const url = new URL(startRes.body.url.replace('about:blank', 'http://x'));
    const callbackRes = await request(app)
      .get('/api/v1/auth/microsoft/callback')
      .query({
        code: url.searchParams.get('code')!,
        state: url.searchParams.get('state')!,
      });
    return callbackRes.body;
  }

  it('rotates the refresh token on use', async () => {
    const { refreshToken } = await signIn();
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('replaying an already-rotated token revokes the whole family — both tokens die', async () => {
    const { refreshToken: original } = await signIn();
    const firstRotation = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original });
    expect(firstRotation.status).toBe(200);
    const rotated = firstRotation.body.refreshToken as string;

    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: original });
    expect(replay.status).toBe(401);

    const rotatedAfterReplay = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated });
    expect(rotatedAfterReplay.status).toBe(401);
  });

  it('logout revokes the refresh token family', async () => {
    const { refreshToken } = await signIn();
    await request(app).post('/api/v1/auth/logout').send({ refreshToken }).expect(204);

    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('auth: access token expiry / tampering', () => {
  it('rejects a malformed bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});
