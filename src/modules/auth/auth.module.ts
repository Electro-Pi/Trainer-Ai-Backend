import { openApiRegistry } from '@/swagger/swagger.js';

import { createAuthRouter } from './auth.routes.js';
import { createMsalService } from './services/msal.service.js';

export const authRouter = createAuthRouter();

// Sanctioned cross-module surface (ARCHITECTURE §4/AGENTS §5) — `directory`
// (P3) resolves a caller's Graph access token through this instead of
// deep-importing `modules/auth/services/msal.service.ts`.
export const msalService = createMsalService();

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/microsoft/start',
  tags: ['Authentication'],
  summary: 'Returns the Entra ID authorization URL (PKCE) to redirect the user to',
  responses: { 200: { description: 'Authorization URL' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/microsoft/callback',
  tags: ['Authentication'],
  summary: 'Exchanges the Entra authorization code for our access/refresh token pair',
  responses: { 200: { description: 'Token pair' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Authentication'],
  summary: 'Email/password fallback sign-in (AU-07)',
  responses: { 200: { description: 'Token pair' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Authentication'],
  summary: 'Rotates a refresh token; reuse of an already-rotated token revokes the session family',
  responses: { 200: { description: 'New token pair' } },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Authentication'],
  summary: 'Revokes the current refresh token family',
  responses: { 204: { description: 'Logged out' } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentication'],
  summary: 'Returns the authenticated portal user',
  responses: { 200: { description: 'Current user' } },
});
