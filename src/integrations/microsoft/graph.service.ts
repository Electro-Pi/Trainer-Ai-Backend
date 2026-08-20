import { ExternalServiceError } from '@/common/exceptions/app-error.js';
import { env } from '@/config/env.js';
import { logger } from '@/logger/logger.service.js';

import type {
  CreateMeetingInput,
  GraphGuestInvitation,
  GraphMeeting,
  GraphService,
  GraphUser,
  GraphUserCollection,
  InviteGuestInput,
  SendGraphMailInput,
} from './graph.interfaces.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const MAX_RETRIES = 3;
const LIST_PAGE_SIZE = 999;
const MAX_LIST_PAGES = 10;

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
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${GRAPH_BASE_URL}${resourcePath}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...extraHeaders,
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
        const errorBody = await response.text().catch(() => '');
        logger.error({ url, status: response.status, errorBody }, 'Microsoft Graph request failed');
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

  /** `TM-01` — `$search` on displayName/mail/userPrincipalName, tenant-wide.
   * `$search` is an advanced query capability: Graph requires `ConsistencyLevel: eventual`
   * on the request and `$count=true` in the query, or it rejects the request outright. */
  async searchUsers(query: string, accessToken: string): Promise<GraphUser[]> {
    const search = encodeURIComponent(`"displayName:${query}" OR "mail:${query}"`);
    const select = 'id,displayName,mail,userPrincipalName';
    const result = await this.request<GraphUserCollection>(
      'GET',
      `/users?$search=${search}&$select=${select}&$count=true`,
      accessToken,
      undefined,
      { ConsistencyLevel: 'eventual' },
    );
    return result.value;
  }

  /** `TM-01` — plain (non-`$search`) directory listing so the UI can show the whole
   * org before the manager types anything. Pages via `@odata.nextLink`, capped at
   * `MAX_LIST_PAGES` so one huge tenant can't turn this into a runaway request chain. */
  async listAllUsers(accessToken: string): Promise<GraphUser[]> {
    const select = 'id,displayName,mail,userPrincipalName';
    const users: GraphUser[] = [];
    let path: string | null = `/users?$select=${select}&$top=${LIST_PAGE_SIZE}`;

    for (let page = 0; path && page < MAX_LIST_PAGES; page++) {
      const result: GraphUserCollection = path.startsWith('http')
        ? await this.requestAbsolute<GraphUserCollection>(path, accessToken)
        : await this.get<GraphUserCollection>(path, accessToken);
      users.push(...result.value);
      path = result['@odata.nextLink'] ?? null;
    }

    return users;
  }

  private async requestAbsolute<T>(url: string, accessToken: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error({ url, status: response.status, errorBody }, 'Microsoft Graph request failed');
      throw new ExternalServiceError(
        `Microsoft Graph request failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as T;
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

  /**
   * `IV-01`, `IV-05` — a calendar `event` with `isOnlineMeeting: true`
   * rather than a bare `/me/onlineMeetings` object: creating a calendar
   * event with `attendees` is what makes Outlook actually send each
   * attendee a native meeting-invite email (accept/decline, added to their
   * calendar) — `/onlineMeetings` alone never sends any email, it only
   * provisions the Teams meeting itself. Graph still auto-provisions the
   * Teams meeting (`onlineMeetingProvider: 'teamsForBusiness'`) and returns
   * its `joinUrl` via `onlineMeeting.joinUrl`, so the join-link behavior
   * callers depend on (`GraphMeeting.joinWebUrl`) is unchanged.
   * Lobby/presenter restrictions (`IV-05`) aren't configurable through the
   * `events` payload the way `/onlineMeetings` allowed — they default to
   * the tenant's own Teams meeting policy for calendar-created meetings.
   */
  async createMeeting(input: CreateMeetingInput, accessToken: string): Promise<GraphMeeting> {
    const result = await this.request<{
      id: string;
      onlineMeeting: { joinUrl: string } | null;
    }>('POST', '/me/events', accessToken, {
      subject: input.subject,
      start: { dateTime: input.startDateTime, timeZone: 'UTC' },
      end: { dateTime: input.endDateTime, timeZone: 'UTC' },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      attendees: input.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: 'required',
      })),
    });
    if (!result.onlineMeeting?.joinUrl) {
      throw new ExternalServiceError('Graph event created without an online meeting join URL');
    }
    return { id: result.id, joinWebUrl: result.onlineMeeting.joinUrl };
  }

  /** `TP-06` — updates the meeting's time window on reschedule. */
  async updateMeeting(
    meetingId: string,
    input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
    accessToken: string,
  ): Promise<GraphMeeting> {
    const result = await this.request<{
      id: string;
      onlineMeeting: { joinUrl: string } | null;
    }>('PATCH', `/me/events/${meetingId}`, accessToken, {
      start: { dateTime: input.startDateTime, timeZone: 'UTC' },
      end: { dateTime: input.endDateTime, timeZone: 'UTC' },
    });
    if (!result.onlineMeeting?.joinUrl) {
      throw new ExternalServiceError('Graph event updated without an online meeting join URL');
    }
    return { id: result.id, joinWebUrl: result.onlineMeeting.joinUrl };
  }

  async cancelMeeting(meetingId: string, accessToken: string): Promise<void> {
    await this.request<void>('DELETE', `/me/events/${meetingId}`, accessToken);
  }

  /** `RP-02` — sends from the caller's own mailbox via Graph `sendMail`. */
  async sendMail(input: SendGraphMailInput, accessToken: string): Promise<void> {
    await this.request<void>('POST', '/me/sendMail', accessToken, {
      message: {
        subject: input.subject,
        body: { contentType: 'HTML', content: input.html },
        toRecipients: [{ emailAddress: { address: input.to } }],
        attachments: input.attachments?.map((attachment) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: attachment.contentBytes,
        })),
      },
      saveToSentItems: true,
    });
  }

  /** Cross-tenant B2B guest invite — `POST /invitations`, requires `User.Invite.All`. */
  async inviteGuest(input: InviteGuestInput, accessToken: string): Promise<GraphGuestInvitation> {
    const result = await this.request<{
      inviteRedeemUrl: string;
      invitedUserDisplayName: string | null;
      status: string;
      invitedUser: { id: string };
    }>('POST', '/invitations', accessToken, {
      invitedUserEmailAddress: input.email,
      inviteRedirectUrl: input.redirectUrl,
      sendInvitationMessage: true,
      ...(input.displayName ? { invitedUserDisplayName: input.displayName } : {}),
    });

    return {
      invitedUserId: result.invitedUser.id,
      invitedUserDisplayName: result.invitedUserDisplayName,
      inviteRedeemUrl: result.inviteRedeemUrl,
      status: result.status,
    };
  }
}

export function createGraphService(): GraphService {
  if (env.GRAPH_PROVIDER === 'real') {
    return new RealGraphService();
  }
  throw new Error('createGraphService() called with GRAPH_PROVIDER=fake — use FakeGraphService');
}
