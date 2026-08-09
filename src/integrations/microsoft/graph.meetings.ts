import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { decrypt } from '@/common/utils/encryption.js';
import { container } from '@/config/container.js';
import { msalService } from '@/modules/auth/auth.module.js';
import { portalUserRepository } from '@/modules/users/users.module.js';

import type { CreateMeetingInput, GraphMeeting } from './graph.interfaces.js';

/**
 * `IV-01` — meetings are created on behalf of the plan's creating manager
 * (their own Entra sign-in already carries `OnlineMeetings.ReadWrite`, per
 * `msal.service.ts`'s `SCOPES`), the same pattern `DirectoryService`
 * established for `TM-01`/`TM-06` — no separate service-principal token.
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

export class GraphMeetingsService {
  async createMeeting(organizerId: string, input: CreateMeetingInput): Promise<GraphMeeting> {
    const accessToken = await resolveAccessToken(organizerId);
    return container.resolveGraph().createMeeting(input, accessToken);
  }

  async updateMeeting(
    organizerId: string,
    meetingId: string,
    input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
  ): Promise<GraphMeeting> {
    const accessToken = await resolveAccessToken(organizerId);
    return container.resolveGraph().updateMeeting(meetingId, input, accessToken);
  }

  async cancelMeeting(organizerId: string, meetingId: string): Promise<void> {
    const accessToken = await resolveAccessToken(organizerId);
    await container.resolveGraph().cancelMeeting(meetingId, accessToken);
  }
}

export const graphMeetingsService = new GraphMeetingsService();
