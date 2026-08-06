// Graph surface consumed by later phases (directory search P3, meetings P7,
// mail P9). Kept minimal here — P2 only needs the client factory to exist;
// each method is added by the phase that first calls it.
export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

export interface GraphService {
  /** GET on an arbitrary Graph resource path (e.g. `/me`), token-cached, 429-retried. */
  get<T>(resourcePath: string, accessToken: string): Promise<T>;
}
