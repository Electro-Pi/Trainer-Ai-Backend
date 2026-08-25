// Wire types for the external AI Trainer microservice's 7 endpoints —
// intentionally `snake_case` to mirror their JSON verbatim (unlike our own
// DTOs in `dto/ai-trainer.dto.ts`, which are `camelCase` per this codebase's
// convention). `ai-trainer-client.service.ts` is the only place that should
// ever import these.

export interface GenerateSlidesSkillInput {
  skill_name: string;
  outcomes: string[];
}

export interface GenerateSlidesRequest {
  track_name: string;
  track_description?: string | null;
  language?: 'en-US' | 'ar-SA';
  skills: GenerateSlidesSkillInput[];
}

export interface GenerateSlidesSkillResult {
  skill_name: string;
  slide_deck_id: string;
  status: 'ready' | 'failed';
  slide_count: number | null;
  generation_error: string | null;
  download_url: string | null;
}

export interface GenerateSlidesResponse {
  track_name: string;
  skills: GenerateSlidesSkillResult[];
}

/**
 * `POST /slides/with-attachments` — the `multipart/form-data` sibling of
 * `POST /slides`, one skill (and therefore one session) per call. `file` is
 * the raw bytes + filename/mimetype of an optional PDF/DOCX/PPTX reference
 * document; omit it to generate from `outcomes` alone. Unlike
 * `GenerateSlidesRequest`, there is no `skills[]` array — every field is its
 * own multipart part.
 */
export interface GenerateSlideWithAttachmentRequest {
  track_name: string;
  track_description?: string | null;
  language?: 'en-US' | 'ar-SA';
  skill_name: string;
  outcomes: string[];
  file?: { data: Buffer; filename: string; mimeType: string } | null;
}

export interface GenerateSlideWithAttachmentResponse {
  track_name: string;
  skill_name: string;
  slide_deck_id: string;
  status: 'ready' | 'failed';
  slide_count: number | null;
  generation_error: string | null;
  download_url: string | null;
}

export interface SuggestSkillsRequest {
  track_name: string;
  track_description?: string | null;
}

export interface SuggestedSkill {
  skill_name: string;
  rationale: string;
  outcomes: string[];
}

export interface SuggestSkillsResponse {
  suggested_skills: SuggestedSkill[];
}

export interface SuggestOutcomesRequest {
  track_name: string;
  track_description?: string | null;
  skill_name: string;
}

export interface SuggestOutcomesResponse {
  suggested_outcomes: string[];
}

export interface StartExternalSessionRequest {
  user_id: string;
  user_name: string;
  user_role: string;
  user_email?: string | null;
  slide_deck_id: string;
  skill_name: string;
  meeting_url: string;
  language?: 'en-US' | 'ar-SA';
}

export interface StartExternalSessionResponse {
  id: string;
  channel: 'external';
  status: string;
  meeting_url: string;
  dispatch_error: string | null;
}

export interface SessionStatusResponse {
  id: string;
  slide_deck_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  user_email: string | null;
  channel: 'web' | 'meet' | 'teams' | 'external';
  status: 'pending' | 'provisioning' | 'in_progress' | 'completed' | 'failed' | 'abandoned';
  current_slide_index: number;
  max_slide_index_reached: number;
  questions_recorded: number;
  external_meeting_url: string | null;
  external_dispatch_error: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface SessionTranscriptTurn {
  turn_index: number;
  speaker: 'trainer_ai' | 'trainee';
  text: string;
  occurred_at: string;
}

export interface SessionTranscriptResponse {
  session_id: string;
  status: string;
  turns: SessionTranscriptTurn[];
}

export interface SessionEvaluationOutcomeResult {
  outcome: string;
  questions_asked: number;
  questions_correct: number;
  passed: boolean;
}

/** `trainee_view.questions[]` — coaching-toned feedback, via `ai_feedback`. */
export interface SessionEvaluationTraineeQuestion {
  question_index: number;
  question_text: string;
  trainee_answer_text: string;
  is_correct: boolean;
  ai_feedback: string;
  outcome_text: string;
}

export interface SessionEvaluationTraineeView {
  overall_score: number;
  passed: boolean;
  summary_feedback: string;
  strengths: string[];
  areas_for_improvement: string[];
  questions: SessionEvaluationTraineeQuestion[];
  outcome_results: SessionEvaluationOutcomeResult[];
}

/** `manager_view.questions[]` — same questions as `trainee_view`, but readiness/risk-toned feedback via `manager_feedback` instead of `ai_feedback`. */
export interface SessionEvaluationManagerQuestion {
  question_index: number;
  question_text: string;
  trainee_answer_text: string;
  is_correct: boolean;
  manager_feedback: string;
  outcome_text: string;
}

export interface SessionEvaluationManagerView {
  overall_score: number;
  passed: boolean;
  readiness: 'ready' | 'needs_practice' | 'not_ready';
  risk_areas: string[];
  outcome_coverage_comparison: string;
  questions: SessionEvaluationManagerQuestion[];
  outcome_results: SessionEvaluationOutcomeResult[];
}

/**
 * `GET /sessions/{session_id}/evaluation`. `manager_view` is `null` when the
 * evaluation predates the manager-evaluation feature (no backfill for older
 * rows) — every consumer must handle that, not assume it's always present.
 */
export interface SessionEvaluationResponse {
  session_id: string;
  trainee_view: SessionEvaluationTraineeView;
  manager_view: SessionEvaluationManagerView | null;
}

/** Shape of the AI Trainer service's error body — `{"detail": "..."}` on every non-2xx response. */
export interface AiTrainerErrorBody {
  detail?: string;
}
