import type { Request, Response } from 'express';

import { env } from '@/config/env.js';

import type {
  AuthorizeUrlResponseDto,
  MeResponseDto,
  TokenResponseDto,
} from '../dto/token-response.dto.js';
import { AuthService, type DemoRole } from '../services/auth.service.js';
import { createMsalService } from '../services/msal.service.js';
import { PkceStoreService } from '../services/pkce-store.service.js';

const msal = createMsalService();
const pkceStore = new PkceStoreService();
const authService = new AuthService();

function toTokenResponse(tokens: { accessToken: string; refreshToken: string }): TokenResponseDto {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_TTL,
  };
}

export class AuthController {
  /**
   * `inviteToken` (query, optional) round-trips through the two-request
   * Entra auth-code flow the same way `state`/`codeVerifier` already do —
   * present when the invited manager/content-manager arrived via their
   * invite link (`/invite/accept?token=...` on the frontend), absent for a
   * cold/uninvited signup.
   */
  async microsoftStart(req: Request, res: Response): Promise<void> {
    const { inviteToken } = req.query as { inviteToken?: string };
    const { url, state, codeVerifier } = await msal.createAuthCodeUrl();
    await pkceStore.save(state, codeVerifier, inviteToken);
    const body: AuthorizeUrlResponseDto = { url };
    res.status(200).json(body);
  }

  async microsoftCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query as unknown as { code: string; state: string };

    const consumed = await pkceStore.consume(state);
    if (!consumed) {
      res.status(400).json({ detail: 'Sign-in session expired or invalid state' });
      return;
    }

    const result = await msal.acquireTokenByCode(code, consumed.codeVerifier);
    const { tokens } = await authService.signInWithMicrosoft(result, consumed.inviteToken);

    res.status(200).json(toTokenResponse(tokens));
  }

  async passwordLogin(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as { email: string; password: string };
    const { tokens } = await authService.signInWithPassword(email, password);
    res.status(200).json(toTokenResponse(tokens));
  }

  /** Demo-only fast login — see `AuthService.signInAsDemoAccount`'s doc comment for the full removal list if this feature is ever taken out. */
  async demoLogin(req: Request, res: Response): Promise<void> {
    const { role } = req.body as { role: DemoRole };
    const { tokens } = await authService.signInAsDemoAccount(role);
    res.status(200).json(toTokenResponse(tokens));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as { refreshToken: string };
    const tokens = await authService.refresh(refreshToken);
    res.status(200).json(toTokenResponse(tokens));
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body as { refreshToken: string };
    await authService.logout(refreshToken);
    res.status(204).send();
  }

  async me(req: Request, res: Response): Promise<void> {
    // `authenticate()` guarantees `req.auth` is set before this handler runs.
    const user = await authService.getById(req.auth!.sub);
    const body: MeResponseDto = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      role: user.role,
      locale: user.locale,
    };
    res.status(200).json(body);
  }
}
