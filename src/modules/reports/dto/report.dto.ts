export interface ReportDetailOutcomeDto {
  title: string;
  verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null;
  score: number | null;
  isCarriedOver: boolean;
}

export interface ReportDetailContentDto {
  name: string;
  delivered: boolean;
}

export interface ReportDetailOutcomeResultDto {
  outcome: string;
  questionsAsked: number;
  questionsCorrect: number;
  passed: boolean;
}

export interface ReportDetailTraineeQuestionDto {
  questionIndex: number;
  questionText: string;
  traineeAnswerText: string;
  isCorrect: boolean;
  aiFeedback: string;
  outcomeText: string;
}

export interface ReportDetailTraineeEvaluationDto {
  overallScore: number;
  passed: boolean;
  summaryFeedback: string;
  questions: ReportDetailTraineeQuestionDto[];
  outcomeResults: ReportDetailOutcomeResultDto[];
}

export interface ReportDetailManagerQuestionDto {
  questionIndex: number;
  questionText: string;
  traineeAnswerText: string;
  isCorrect: boolean;
  managerFeedback: string;
  outcomeText: string;
}

export interface ReportDetailManagerEvaluationDto {
  overallScore: number;
  passed: boolean;
  readiness: 'ready' | 'needs_practice' | 'not_ready';
  riskAreas: string[];
  outcomeCoverageComparison: string;
  questions: ReportDetailManagerQuestionDto[];
  outcomeResults: ReportDetailOutcomeResultDto[];
}

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
   * Cheap list-safe fields, resolved the same way as `score` above (straight
   * off `Session`, one join to its `primaryOutcome`/`skill` — not the full
   * `ReportDataService.buildSessionReport` view `detail` below uses). `null`
   * for a PLAN_SUMMARY report or a SESSION report whose session record is
   * gone. The list endpoint needs these so a report row shows its real
   * verdict/outcome/skill instead of a placeholder before ever being opened.
   */
  verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED' | null;
  outcomeTitleEn: string | null;
  outcomeTitleAr: string | null;
  skillNameEn: string | null;
  skillNameAr: string | null;
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
    /** Every outcome the session covered, not just the first — a session can target more than one. */
    outcomes: ReportDetailOutcomeDto[];
    trackName: string;
    levelName: string;
    content: ReportDetailContentDto[];
    answerCount: number;
    /** The AI Trainer's richer per-question breakdown, when available — `null` if the evaluation never resolved. */
    traineeEvaluation: ReportDetailTraineeEvaluationDto | null;
    /** Only present on a `DEPARTMENT_MANAGER` recipient's report. */
    managerEvaluation: ReportDetailManagerEvaluationDto | null;
  };
}
