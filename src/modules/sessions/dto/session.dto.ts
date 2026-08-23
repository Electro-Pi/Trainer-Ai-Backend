export interface SessionResponseDto {
  id: string;
  planId: string;
  learnerId: string;
  primaryOutcomeId: string;
  sequence: number;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  status: string;
  verdict: string | null;
  score: number | null;
  joinUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cancelledAt: string | null;
}

export interface RescheduleSessionDto {
  scheduledStart: string;
  scheduledEnd: string;
  /** True while the plan wizard is still adjusting a session's proposed time
   *  before the manager has confirmed anything — skips the "your session
   *  moved" notification (and, once a meeting exists, the real Teams patch)
   *  entirely, regardless of the parent plan's status. Defaults to false so
   *  every other caller (Sessions/Calendar screens rescheduling a live
   *  session) keeps notifying as before. */
  silent?: boolean;
}

export interface CalendarQueryDto {
  learnerId?: string;
  teamId?: string;
  from?: string;
  to?: string;
}

export interface SessionTranscriptTurnDto {
  turnIndex: number;
  speaker: 'trainer_ai' | 'trainee';
  text: string;
  occurredAt: string;
}

export interface SessionTranscriptResponseDto {
  sessionId: string;
  status: string;
  turns: SessionTranscriptTurnDto[];
}

export interface InvitationResponseDto {
  id: string;
  sessionId: string;
  learnerId: string;
  graphEventId: string;
  sentAt: string;
  rsvpStatus: string;
  respondedAt: string | null;
  reminderSentAt: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  attendanceMinutes: number | null;
}
