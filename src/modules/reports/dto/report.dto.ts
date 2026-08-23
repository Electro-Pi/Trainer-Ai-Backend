export interface ReportResponseDto {
  id: string;
  sessionId: string | null;
  planId: string | null;
  type: 'SESSION' | 'PLAN_SUMMARY';
  language: 'EN' | 'AR';
  status: 'PENDING' | 'GENERATED' | 'SENT' | 'FAILED';
  generatedAt: string | null;
  sentAt: string | null;
  failureReason: string | null;
  resendCount: number;
  createdAt: string;
  learnerId: string | null;
  learnerName: string | null;
  /** SESSION: that session's score. PLAN_SUMMARY: average of the plan's scored sessions. `null` when nothing is scored yet. */
  score: number | null;
}
