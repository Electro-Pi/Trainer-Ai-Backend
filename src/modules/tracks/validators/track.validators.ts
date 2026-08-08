import { z } from 'zod';

import { cuidSchema, paginationSchema, slugSchema } from '@/common/validators/primitives.js';

const trainingFormSchema = z.enum(['CONVERSATION', 'CASE', 'SIMULATION', 'ROLEPLAY']);

const bilingualTextSchema = z.string().trim().min(1).max(500);

export const createTrackSchema = z.object({
  key: slugSchema,
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  department: z.string().trim().min(1).max(200),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1),
  trainingForm: trainingFormSchema,
  impactIndicators: z.array(z.string().trim().min(1).max(200)).min(1),
});

export const updateTrackSchema = z.object({
  nameEn: bilingualTextSchema.optional(),
  nameAr: bilingualTextSchema.optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
  department: z.string().trim().min(1).max(200).optional(),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
  trainingForm: trainingFormSchema.optional(),
  impactIndicators: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
});

export const trackFilterSchema = paginationSchema.extend({
  isEnabled: z.coerce.boolean().optional(),
});

export const trackIdParamsSchema = z.object({
  id: cuidSchema,
});

export const setTrackEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const reorderTracksSchema = z.object({
  order: z.array(cuidSchema).min(1),
});

export const duplicateTrackSchema = z.object({
  key: slugSchema,
});
