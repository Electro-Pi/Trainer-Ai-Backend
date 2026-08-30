import { z } from 'zod';

import { cuidSchema, httpsUrlSchema } from '@/common/validators/primitives.js';

export const trackIdParamsSchema = z.object({
  trackId: cuidSchema,
});

export const skillIdParamsSchema = z.object({
  skillId: cuidSchema,
});

export const externalSessionIdParamsSchema = z.object({
  id: z.uuid(),
});

export const suggestTrackSkillsSchema = z.object({
  trackDescription: z.string().trim().min(1).max(2000).optional(),
});

/**
 * `POST /tracks/:trackId/slides` — the deck's narration language. Optional so
 * existing callers keep working; absent means `EN`. Callers pass the owning
 * training plan's language, the only value that matches the session the deck
 * will actually be narrated in.
 */
export const generateTrackSlidesSchema = z.object({
  language: z.enum(['EN', 'AR']).optional(),
});

export const suggestSkillOutcomesSchema = z.object({
  trackDescription: z.string().trim().min(1).max(2000).optional(),
});

export const suggestDraftTrackSkillsSchema = z.object({
  trackName: z.string().trim().min(1).max(200),
  trackDescription: z.string().trim().min(1).max(2000).optional(),
});

export const suggestDraftSkillOutcomesSchema = z.object({
  trackName: z.string().trim().min(1).max(200),
  trackDescription: z.string().trim().min(1).max(2000).optional(),
  skillName: z.string().trim().min(1).max(200),
});

export const startExternalSessionSchema = z.object({
  learnerId: cuidSchema,
  slideDeckId: cuidSchema,
  meetingUrl: httpsUrlSchema,
});

// `POST /external-sessions/:id/complete` — the AI Trainer webhook body.
// `snake_case`, mirroring her wire format verbatim (see the matching DTO's
// comment in `dto/ai-trainer.dto.ts`).

const webhookOutcomeResultSchema = z.object({
  outcome: z.string(),
  questions_asked: z.number().int().nonnegative(),
  questions_correct: z.number().int().nonnegative(),
  passed: z.boolean(),
});

const webhookTraineeQuestionSchema = z.object({
  question_index: z.number().int().nonnegative(),
  question_text: z.string(),
  trainee_answer_text: z.string(),
  is_correct: z.boolean(),
  ai_feedback: z.string(),
  outcome_text: z.string(),
});

const webhookTraineeViewSchema = z.object({
  overall_score: z.number(),
  passed: z.boolean(),
  summary_feedback: z.string(),
  strengths: z.array(z.string()),
  areas_for_improvement: z.array(z.string()),
  questions: z.array(webhookTraineeQuestionSchema),
  outcome_results: z.array(webhookOutcomeResultSchema),
});

const webhookManagerQuestionSchema = z.object({
  question_index: z.number().int().nonnegative(),
  question_text: z.string(),
  trainee_answer_text: z.string(),
  is_correct: z.boolean(),
  manager_feedback: z.string(),
  outcome_text: z.string(),
});

const webhookManagerViewSchema = z.object({
  overall_score: z.number(),
  passed: z.boolean(),
  readiness: z.enum(['ready', 'needs_practice', 'not_ready']),
  risk_areas: z.array(z.string()),
  outcome_coverage_comparison: z.string(),
  questions: z.array(webhookManagerQuestionSchema),
  outcome_results: z.array(webhookOutcomeResultSchema),
});

const webhookTranscriptTurnSchema = z.object({
  turn_index: z.number().int().nonnegative(),
  speaker: z.enum(['trainer_ai', 'trainee']),
  text: z.string(),
  occurred_at: z.string(),
});

const webhookSessionCompleteBodySchema = z.object({
  evaluation: z.object({
    trainee_view: webhookTraineeViewSchema,
    manager_view: webhookManagerViewSchema.nullable().default(null),
  }),
  // Optional: the AI Trainer sends evaluation-only payloads when a session
  // produced no usable transcript (e.g. the audio/transcription broke). An
  // absent transcript is a valid outcome, not a rejectable body.
  transcript: z.object({ turns: z.array(webhookTranscriptTurnSchema) }).default({ turns: [] }),
});

/**
 * Accepts BOTH wire shapes the AI Trainer sends:
 *
 *   canonical: { evaluation: { trainee_view, manager_view }, transcript }
 *   flat:      { session_id?, trainee_view, manager_view, transcript? }
 *
 * The flat form is what her evaluation endpoint returns verbatim, so she was
 * posting it straight through. Normalising here (rather than making her
 * re-wrap) keeps the webhook tolerant; everything downstream still sees the
 * canonical shape only.
 */
export const webhookSessionCompleteSchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null) return value;
  const body = value as Record<string, unknown>;
  if ('evaluation' in body) return body;
  if (!('trainee_view' in body)) return body;

  const { session_id: _sessionId, trainee_view, manager_view, transcript, ...rest } = body;
  return {
    ...rest,
    evaluation: { trainee_view, manager_view: manager_view ?? null },
    ...(transcript === undefined ? {} : { transcript }),
  };
}, webhookSessionCompleteBodySchema);
