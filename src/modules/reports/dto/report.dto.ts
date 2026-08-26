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
  /**
   * Only populated by `getById` (`GET /reports/:id`) for a `SESSION` report
   * whose session has completed — the list endpoint stays cheap. Mirrors the
   * same `ReportDataService.buildSessionReport` view the PDF template
   * renders from, so the portal detail page and the PDF never disagree.
   */
  detail?: {
    outcomeTitle: string;
    verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
    sessionDate: string;
    strengths: string;
    gaps: string;
    agentNotes: string;
    isCarriedOver: boolean;
  };
}
