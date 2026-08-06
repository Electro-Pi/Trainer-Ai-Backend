import type { GraphService, GraphUser } from './graph.interfaces.js';

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
}
