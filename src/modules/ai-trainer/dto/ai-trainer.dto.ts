// Request/response shapes for OUR OWN `/api/v1/tracks/:trackId/slides`,
// `/api/v1/tracks/:trackId/recommendations/skills`,
// `/api/v1/skills/:skillId/recommendations/outcomes`, and
// `/api/v1/external-sessions*` routes — distinct from the AI Trainer
// service's own wire shapes (`services/ai-trainer-client.types.ts`), which
// use the AI service's `snake_case` field names verbatim.

export interface SlideDeckResultDto {
  skillId: string;
  skillName: string;
  slideDeckId: string;
  status: 'ready' | 'failed';
  slideCount: number | null;
  generationError: string | null;
  downloadUrl: string | null;
}

export interface GenerateTrackSlidesResponseDto {
  trackName: string;
  skills: SlideDeckResultDto[];
}

export interface SuggestTrackSkillsRequestDto {
  trackDescription?: string | undefined;
}

export interface SuggestSkillOutcomesRequestDto {
  trackDescription?: string | undefined;
}

/** Draft-mode advisory suggestions — for a track still being composed in the creation wizard, before it has a real id. */
export interface SuggestDraftTrackSkillsRequestDto {
  trackName: string;
  trackDescription?: string | undefined;
}

export interface SuggestDraftSkillOutcomesRequestDto {
  trackName: string;
  trackDescription?: string | undefined;
  skillName: string;
}

export interface SuggestedSkillDto {
  skillName: string;
  rationale: string;
  outcomes: string[];
}

export interface SuggestTrackSkillsResponseDto {
  suggestedSkills: SuggestedSkillDto[];
}

export interface SuggestSkillOutcomesResponseDto {
  suggestedOutcomes: string[];
}

export interface StartExternalSessionRequestDto {
  learnerId: string;
  slideDeckId: string;
  meetingUrl: string;
}

export interface ExternalSessionResponseDto {
  id: string;
  channel: 'external';
  status: string;
  meetingUrl: string;
  dispatchError: string | null;
}

export interface ExternalSessionStatusResponseDto {
  id: string;
  slideDeckId: string;
  userId: string;
  userName: string;
  userRole: string;
  userEmail: string | null;
  channel: 'web' | 'meet' | 'teams' | 'external';
  status: 'pending' | 'provisioning' | 'in_progress' | 'completed' | 'failed' | 'abandoned';
  currentSlideIndex: number;
  maxSlideIndexReached: number;
  questionsRecorded: number;
  externalMeetingUrl: string | null;
  externalDispatchError: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface ExternalSessionTranscriptTurnDto {
  turnIndex: number;
  speaker: 'trainer_ai' | 'trainee';
  text: string;
  occurredAt: string;
}

export interface ExternalSessionTranscriptResponseDto {
  sessionId: string;
  status: string;
  turns: ExternalSessionTranscriptTurnDto[];
}

export interface ExternalSessionOutcomeResultDto {
  outcome: string;
  questionsAsked: number;
  questionsCorrect: number;
  passed: boolean;
}

export interface ExternalSessionTraineeQuestionDto {
  questionIndex: number;
  questionText: string;
  traineeAnswerText: string;
  isCorrect: boolean;
  aiFeedback: string;
  outcomeText: string;
}

export interface ExternalSessionTraineeViewDto {
  overallScore: number;
  passed: boolean;
  summaryFeedback: string;
  strengths: string[];
  areasForImprovement: string[];
  questions: ExternalSessionTraineeQuestionDto[];
  outcomeResults: ExternalSessionOutcomeResultDto[];
}

export interface ExternalSessionManagerQuestionDto {
  questionIndex: number;
  questionText: string;
  traineeAnswerText: string;
  isCorrect: boolean;
  managerFeedback: string;
  outcomeText: string;
}

export interface ExternalSessionManagerViewDto {
  overallScore: number;
  passed: boolean;
  readiness: 'ready' | 'needs_practice' | 'not_ready';
  riskAreas: string[];
  outcomeCoverageComparison: string;
  questions: ExternalSessionManagerQuestionDto[];
  outcomeResults: ExternalSessionOutcomeResultDto[];
}

export interface ExternalSessionEvaluationResponseDto {
  sessionId: string;
  traineeView: ExternalSessionTraineeViewDto;
  /** `null` when the evaluation predates the manager-evaluation feature. */
  managerView: ExternalSessionManagerViewDto | null;
}
