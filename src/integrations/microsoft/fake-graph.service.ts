import { randomUUID } from 'node:crypto';

import { logger } from '@/logger/logger.service.js';

import type {
  CreateMeetingInput,
  GraphMeeting,
  GraphService,
  GraphUser,
  SendGraphMailInput,
} from './graph.interfaces.js';

const FAKE_USERS: GraphUser[] = [
  {
    id: 'fake-user-1',
    displayName: 'Sara Ahmed',
    mail: 'sara.ahmed@example.com',
    userPrincipalName: 'sara.ahmed@example.com',
  },
  {
    id: 'fake-user-2',
    displayName: 'Omar Khalil',
    mail: 'omar.khalil@example.com',
    userPrincipalName: 'omar.khalil@example.com',
  },
  {
    id: 'fake-user-3',
    displayName: 'Layla Hassan',
    mail: 'layla.hassan@example.com',
    userPrincipalName: 'layla.hassan@example.com',
  },
];

/** Deterministic dev/test default (ARCHITECTURE §4.5, D-14) — no Azure tenant required. */
export class FakeGraphService implements GraphService {
  async get<T>(resourcePath: string, _accessToken: string): Promise<T> {
    if (resourcePath === '/me' || resourcePath.startsWith('/users/')) {
      return Promise.resolve(FAKE_USERS[0] as T);
    }
    if (resourcePath.startsWith('/users')) {
      return Promise.resolve(FAKE_USERS as T);
    }
    return Promise.resolve({} as T);
  }

  async searchUsers(query: string, _accessToken: string): Promise<GraphUser[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return Promise.resolve(FAKE_USERS);
    return Promise.resolve(
      FAKE_USERS.filter(
        (user) =>
          user.displayName.toLowerCase().includes(needle) ||
          (user.mail?.toLowerCase().includes(needle) ?? false),
      ),
    );
  }

  async getGroupMembers(_groupId: string, _accessToken: string): Promise<GraphUser[]> {
    return Promise.resolve(FAKE_USERS);
  }

  async createMeeting(input: CreateMeetingInput, _accessToken: string): Promise<GraphMeeting> {
    const id = randomUUID();
    return Promise.resolve({
      id,
      joinWebUrl: `https://teams.microsoft.com/fake-meeting/${id}?subject=${encodeURIComponent(input.subject)}`,
    });
  }

  async updateMeeting(
    meetingId: string,
    _input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
    _accessToken: string,
  ): Promise<GraphMeeting> {
    return Promise.resolve({
      id: meetingId,
      joinWebUrl: `https://teams.microsoft.com/fake-meeting/${meetingId}`,
    });
  }

  async cancelMeeting(_meetingId: string, _accessToken: string): Promise<void> {
    return Promise.resolve();
  }

  async sendMail(input: SendGraphMailInput, _accessToken: string): Promise<void> {
    logger.info(
      { to: input.to, subject: input.subject, attachments: input.attachments?.length ?? 0 },
      'FakeGraphService.sendMail — no real mail sent',
    );
    return Promise.resolve();
  }
}
