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
}

export interface CalendarQueryDto {
  learnerId?: string;
  teamId?: string;
  from?: string;
  to?: string;
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
