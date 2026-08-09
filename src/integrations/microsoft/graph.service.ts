import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import type {
  CreateMeetingInput,
  GraphMeeting,
  GraphService,
  GraphUser,
  GraphUserCollection,
} from './graph.interfaces.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin fetch wrapper over Graph — auth (token acquisition/caching) lives in
 * `auth/services/msal.service.ts`; this class only issues authenticated
 * calls and retries on `429` per `Retry-After`, since Graph throttles
 * per-tenant and every later phase (directory, meetings, mail) hits it.
 */
export class RealGraphService implements GraphService {
  async get<T>(resourcePath: string, accessToken: string): Promise<T> {
    return this.request<T>('GET', resourcePath, accessToken);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    resourcePath: string,
    accessToken: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${GRAPH_BASE_URL}${resourcePath}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1');
        logger.warn({ url, attempt, retryAfterSeconds }, 'Graph rate-limited, retrying');
        await sleep(retryAfterSeconds * 1000);
        continue;
      }

      if (!response.ok) {
        throw new ExternalServiceError(
          `Microsoft Graph request failed: ${response.status} ${response.statusText}`,
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    throw new ExternalServiceError('Microsoft Graph request exhausted retries');
  }

  /** `TM-01` — `$search` on displayName/mail/userPrincipalName, tenant-wide. */
  async searchUsers(query: string, accessToken: string): Promise<GraphUser[]> {
    const search = encodeURIComponent(`"displayName:${query}" OR "mail:${query}"`);
    const select = 'id,displayName,mail,userPrincipalName';
    const result = await this.get<GraphUserCollection>(
      `/users?$search=${search}&$select=${select}`,
      accessToken,
    );
    return result.value;
  }

  /** `TM-06` — members of a Microsoft 365 group / Teams channel roster. */
  async getGroupMembers(groupId: string, accessToken: string): Promise<GraphUser[]> {
    const select = 'id,displayName,mail,userPrincipalName';
    const result = await this.get<GraphUserCollection>(
      `/groups/${groupId}/members?$select=${select}`,
      accessToken,
    );
    return result.value;
  }

  /** `IV-01`, `IV-05` — lobby restricted to invited participants, agent joins as presenter. */
  async createMeeting(input: CreateMeetingInput, accessToken: string): Promise<GraphMeeting> {
    const result = await this.request<{ id: string; joinWebUrl: string }>(
      'POST',
      '/me/onlineMeetings',
      accessToken,
      {
        subject: input.subject,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        lobbyBypassSettings: { scope: 'invited', isDialInBypassEnabled: false },
        allowedPresenters: 'roleIsPresenter',
        participants: {
          attendees: input.attendeeEmails.map((email) => ({
            upn: email,
            role: 'attendee',
          })),
        },
      },
    );
    return { id: result.id, joinWebUrl: result.joinWebUrl };
  }

  /** `TP-06` — updates the meeting's time window on reschedule. */
  async updateMeeting(
    meetingId: string,
    input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
    accessToken: string,
  ): Promise<GraphMeeting> {
    const result = await this.request<{ id: string; joinWebUrl: string }>(
      'PATCH',
      `/me/onlineMeetings/${meetingId}`,
      accessToken,
      { startDateTime: input.startDateTime, endDateTime: input.endDateTime },
    );
    return { id: result.id, joinWebUrl: result.joinWebUrl };
  }

  async cancelMeeting(meetingId: string, accessToken: string): Promise<void> {
    await this.request<void>('DELETE', `/me/onlineMeetings/${meetingId}`, accessToken);
  }
}

export function createGraphService(): GraphService {
  if (env.GRAPH_PROVIDER === 'real') {
    return new RealGraphService();
  }
  throw new Error('createGraphService() called with GRAPH_PROVIDER=fake — use FakeGraphService');
}
