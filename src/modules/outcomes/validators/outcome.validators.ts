import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

const trainingFormSchema = z.enum(['CONVERSATION', 'CASE', 'SIMULATION', 'ROLEPLAY']);
const bilingualTextSchema = z.string().trim().min(1).max(500);

export const createOutcomeSchema = z.object({
  titleEn: bilingualTextSchema,
  titleAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1),
  trainingForm: trainingFormSchema,
});

export const updateOutcomeSchema = z.object({
  titleEn: bilingualTextSchema.optional(),
  titleAr: bilingualTextSchema.optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
  trainingForm: trainingFormSchema.optional(),
});

export const levelIdParamsSchema = z.object({
  levelId: cuidSchema,
});

export const outcomeIdParamsSchema = z.object({
  id: cuidSchema,
});

export const setOutcomeEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const reorderOutcomesSchema = z.object({
  order: z.array(cuidSchema).min(1),
});
