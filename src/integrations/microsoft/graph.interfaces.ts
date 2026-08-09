// Graph surface consumed by later phases (directory search P3, meetings P7,
// mail P9). Kept minimal here — P2 only needs the client factory to exist;
// each method is added by the phase that first calls it.
export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

export interface GraphUserCollection {
  value: GraphUser[];
}

/** `IV-01`, `IV-05` — a Teams online meeting, lobby-restricted to invited participants. */
export interface CreateMeetingInput {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  attendeeEmails: string[];
}

export interface GraphMeeting {
  id: string;
  joinWebUrl: string;
}

/** `RP-02` — an email with an optional PDF attachment, sent via Graph `sendMail`. */
export interface SendGraphMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; contentType: string; contentBytes: string }[];
}

export interface GraphService {
  /** GET on an arbitrary Graph resource path (e.g. `/me`), token-cached, 429-retried. */
  get<T>(resourcePath: string, accessToken: string): Promise<T>;

  /** `TM-01` — searches the tenant directory by name/email/UPN prefix. */
  searchUsers(query: string, accessToken: string): Promise<GraphUser[]>;

  /** `TM-06` — lists the members of a Microsoft 365 group or Teams channel roster. */
  getGroupMembers(groupId: string, accessToken: string): Promise<GraphUser[]>;

  /** `IV-01` — creates a Teams online meeting with the lobby restricted to invited participants and the AI agent as presenter (`IV-05`). */
  createMeeting(input: CreateMeetingInput, accessToken: string): Promise<GraphMeeting>;

  /** `TP-06` — updates an existing meeting's time window on reschedule. */
  updateMeeting(
    meetingId: string,
    input: Pick<CreateMeetingInput, 'startDateTime' | 'endDateTime'>,
    accessToken: string,
  ): Promise<GraphMeeting>;

  /** Cancels a meeting on session cancellation — best-effort, never blocks the cancel itself. */
  cancelMeeting(meetingId: string, accessToken: string): Promise<void>;

  /** `RP-02` — sends mail from the caller's own mailbox via Graph `sendMail`. */
  sendMail(input: SendGraphMailInput, accessToken: string): Promise<void>;
}
