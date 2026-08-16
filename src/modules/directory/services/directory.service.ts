import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { decrypt } from '@/common/utils/encryption.js';
import { container } from '@/config/container.js';
import type { GraphUser } from '@/integrations/microsoft/graph.interfaces.js';
import { msalService } from '@/modules/auth/auth.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { DirectoryUserDto } from '../dto/directory.dto.js';

function toDto(user: GraphUser): DirectoryUserDto {
  return {
    entraObjectId: user.id,
    displayName: user.displayName,
    email: user.mail,
    userPrincipalName: user.userPrincipalName,
  };
}

/**
 * `TM-01`/`TM-06` — the calling PortalUser's own Entra sign-in already
 * carries `User.Read.All` (`msal.service.ts`'s `SCOPES`), so directory reads
 * are done on their behalf rather than a separate service-principal token.
 */
async function resolveAccessToken(callerId: string): Promise<string> {
  const caller = await portalUserRepository.findByIdUnscoped(callerId);
  if (!caller?.graphHomeAccountId || !caller.graphTokenCacheEncrypted) {
    throw new ExternalServiceError(
      'No Microsoft Graph session for this user — sign in via Entra ID first',
    );
  }

  return msalService.acquireGraphTokenSilent(
    caller.graphHomeAccountId,
    decrypt(caller.graphTokenCacheEncrypted),
  );
}

export class DirectoryService {
  async searchUsers(callerId: string, query: string): Promise<DirectoryUserDto[]> {
    const accessToken = await resolveAccessToken(callerId);
    const users = await container.resolveGraph().searchUsers(query, accessToken);
    return users.map(toDto);
  }

  async listUsers(callerId: string): Promise<DirectoryUserDto[]> {
    const accessToken = await resolveAccessToken(callerId);
    const users = await container.resolveGraph().listAllUsers(accessToken);
    return users.map(toDto);
  }

  async getGroupMembers(callerId: string, groupId: string): Promise<DirectoryUserDto[]> {
    const accessToken = await resolveAccessToken(callerId);
    const members = await container.resolveGraph().getGroupMembers(groupId, accessToken);
    return members.map(toDto);
  }
}
