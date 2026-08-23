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
 * Thrown only by `createMeeting`'s join-URL poll giving up — carries the
 * already-created event's id so `create-meeting.job.ts` can persist
 * `graphEventId` on this failure too. Without it, the job has no way to
 * learn the event exists, so its own retry (or pg-boss's automatic retry)
 * calls `POST /me/events` again and creates a second calendar invite for
 * the same session instead of recovering the first one.
 */
export class GraphMeetingCreatedWithoutJoinUrlError extends ExternalServiceError {
  constructor(readonly eventId: string) {
    super(`Graph event ${eventId} created without an online meeting join URL`);
  }
}

/**
 * Thrown when Graph 404s on a request against an event id we already hold —
 * distinct from a generic `ExternalServiceError` so `updateMeeting`'s caller
 * (`meeting-update.job.ts`) can tell "the meeting was deleted out from under
 * us" (someone removed the calendar event directly in Outlook — the
 * `graphEventId` this session still has is now stale) apart from a real
 * transient Graph failure, and recover instead of failing forever on every
 * retry.
 */
export class GraphEventNotFoundError extends ExternalServiceError {
  constructor(readonly eventId: string) {
    super(`Graph event ${eventId} no longer exists`);
  }
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

    // The calendar event (and its attendee invite email) is already real at
    // this point — Graph sometimes finishes provisioning the Teams meeting
    // itself a beat after the event write returns, so `onlineMeeting` can
    // still be null here. Throwing here used to discard `result.id`
    // entirely: the caller never learned this event existed, so a retry
    // called `POST /me/events` again and created a second calendar invite
    // for the same session. Poll the same event by id instead — idempotent,
    // never creates anything — and only give up after a few short waits.
    let joinUrl = result.onlineMeeting?.joinUrl ?? null;
    for (let attempt = 0; !joinUrl && attempt < 3; attempt++) {
      await sleep(1500);
      const refreshed = await this.request<{ onlineMeeting: { joinUrl: string } | null }>(
        'GET',
        `/me/events/${result.id}?$select=onlineMeeting`,
        accessToken,
      );
      joinUrl = refreshed.onlineMeeting?.joinUrl ?? null;
    }

    if (!joinUrl) {
      logger.error(
        { eventId: result.id },
        'Graph event created but never got an online meeting join URL — event kept, not retried',
      );
      throw new GraphMeetingCreatedWithoutJoinUrlError(result.id);
    }

    return { id: result.id, joinWebUrl: joinUrl };
  }

  /**
   * Recovery path for `GraphMeetingCreatedWithoutJoinUrlError` — re-checks
   * an already-created event for its Teams `joinUrl` on a later job retry,
   * a plain idempotent `GET` that never creates a new event the way calling
   * `createMeeting` again would.
   */
  async getMeetingJoinUrl(eventId: string, accessToken: string): Promise<string | null> {
    const result = await this.request<{ onlineMeeting: { joinUrl: string } | null }>(
      'GET',
      `/me/events/${eventId}?$select=onlineMeeting`,
      accessToken,
    );
    return result.onlineMeeting?.joinUrl ?? null;
  }

  /** `TP-06` — updates the meeting's time window on reschedule. */
  async updateMeeting(
    meetingId: string,
    input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
    accessToken: string,
  ): Promise<GraphMeeting> {
    const url = `${GRAPH_BASE_URL}/me/events/${meetingId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: { dateTime: input.startDateTime, timeZone: 'UTC' },
        end: { dateTime: input.endDateTime, timeZone: 'UTC' },
      }),
    });

    // A plain `this.request()` call here would report any non-2xx as an
    // undifferentiated `ExternalServiceError` — the caller has no way to
    // tell "event deleted from Outlook, stop retrying and recover" apart
    // from a transient Graph hiccup worth retrying as-is. This one call is
    // duplicated outside `request()`'s retry loop specifically so the 404
    // case can be told apart before falling through to the generic path.
    if (response.status === 404) {
      logger.error({ meetingId }, 'Graph event not found — likely deleted directly in Outlook');
      throw new GraphEventNotFoundError(meetingId);
    }
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error({ url, status: response.status, errorBody }, 'Microsoft Graph request failed');
      throw new ExternalServiceError(
        `Microsoft Graph request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as {
      id: string;
      onlineMeeting: { joinUrl: string } | null;
    };
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
