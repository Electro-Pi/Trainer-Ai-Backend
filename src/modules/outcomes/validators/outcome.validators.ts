import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

const bilingualTextSchema = z.string().trim().min(1).max(500);

export const createOutcomeSchema = z.object({
  titleEn: bilingualTextSchema,
  titleAr: bilingualTextSchema,
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1),
  skillId: cuidSchema.optional(),
});

export const updateOutcomeSchema = z.object({
  titleEn: bilingualTextSchema.optional(),
  titleAr: bilingualTextSchema.optional(),
  targetSkills: z.array(z.string().trim().min(1).max(200)).min(1).optional(),
  skillId: cuidSchema.optional(),
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
