import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { decrypt } from '@/common/utils/encryption.js';
import { env } from '@/config/env.js';
import { msalService } from '@/modules/auth/auth.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import { FakeGraphService } from './fake-graph.service.js';
import type { GraphService, SendGraphMailInput } from './graph.interfaces.js';
import { RealGraphService } from './graph.service.js';

/**
 * `RP-02` — reports are sent on behalf of the plan's creating manager (the
 * same Entra sign-in already carries `Mail.Send`, per `msal.service.ts`'s
 * `SCOPES`), mirroring `graph.meetings.ts`'s `resolveAccessToken` pattern —
 * no separate service-principal token.
 */
async function resolveAccessToken(portalUserId: string): Promise<string> {
  const user = await portalUserRepository.findByIdUnscoped(portalUserId);
  if (!user?.graphHomeAccountId || !user.graphTokenCacheEncrypted) {
    throw new ExternalServiceError(
      'No Microsoft Graph session for this user — sign in via Entra ID first',
    );
  }

  return msalService.acquireGraphTokenSilent(
    user.graphHomeAccountId,
    decrypt(user.graphTokenCacheEncrypted),
  );
}

// Resolves `GraphService` directly rather than via `config/container.ts` —
// `container` also wires `EmailService` (`GraphEmailService` → this file),
// so going through it here would form an import cycle. Same fake/real switch
// as the container, just duplicated at the point that actually needs it.
let graphService: GraphService | undefined;
function resolveGraphService(): GraphService {
  graphService ??= env.GRAPH_PROVIDER === 'real' ? new RealGraphService() : new FakeGraphService();
  return graphService;
}

export class GraphMailService {
  async sendMail(senderPortalUserId: string, input: SendGraphMailInput): Promise<void> {
    const accessToken = await resolveAccessToken(senderPortalUserId);
    await resolveGraphService().sendMail(input, accessToken);
  }
}

export const graphMailService = new GraphMailService();
