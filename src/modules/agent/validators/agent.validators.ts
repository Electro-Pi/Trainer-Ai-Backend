import { z } from 'zod';

import { cuidSchema, scoreSchema } from '@/common/validators/primitives.js';

export const joinTokenParamsSchema = z.object({
  joinToken: z.string().min(1).max(512),
});

export const sessionIdParamsSchema = z.object({
  id: cuidSchema,
});

export const sessionContentIdParamsSchema = z.object({
  id: cuidSchema,
  contentId: cuidSchema,
});

const criterionScoreSchema = z.object({
  criterionId: cuidSchema,
  score: scoreSchema,
  maxScore: scoreSchema,
  judgement: z.string().trim().min(1).max(2000),
});

export const submitAnswerSchema = z.object({
  questionId: cuidSchema.optional(),
  outcomeId: cuidSchema,
  questionText: z.string().trim().min(1).max(2000),
  answerText: z.string().trim().min(1).max(10_000),
  score: scoreSchema,
  maxScore: scoreSchema,
  criterionScores: z.array(criterionScoreSchema).min(1),
  feedback: z.string().trim().max(2000).optional(),
});

export const remediationRequestSchema = z.object({
  outcomeId: cuidSchema,
  failedCriterionLabel: z.string().trim().min(1).max(200).optional(),
});

export const submitNotesSchema = z.object({
  strengths: z.string().trim().min(1).max(4000),
  gaps: z.string().trim().min(1).max(4000),
  agentNotes: z.string().trim().min(1).max(4000),
});

export const submitTranscriptSchema = z.object({
  transcriptText: z.string().trim().min(1).max(500_000),
  recordingConsentGiven: z.boolean(),
});

export const completeSessionSchema = z.object({
  rubricId: cuidSchema.optional(),
});
