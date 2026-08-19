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
