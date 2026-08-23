import { z } from 'zod';

import { cuidSchema, paginationSchema, slugSchema } from '@/common/validators/primitives.js';

const bilingualTextSchema = z.string().trim().min(1).max(500);
const levelNameSchema = z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']);

export const createSkillSchema = z.object({
  key: slugSchema,
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  levels: z.array(levelNameSchema).max(4),
  assessmentEnabled: z.boolean().optional(),
  levelId: cuidSchema.optional(),
});

export const updateSkillSchema = z.object({
  nameEn: bilingualTextSchema.optional(),
  nameAr: bilingualTextSchema.optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
  levels: z.array(levelNameSchema).max(4).optional(),
  assessmentEnabled: z.boolean().optional(),
  levelId: cuidSchema.nullable().optional(),
});

export const skillFilterSchema = paginationSchema.extend({
  isEnabled: z.coerce.boolean().optional(),
});

export const skillIdParamsSchema = z.object({
  id: cuidSchema,
});

export const setSkillEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const duplicateSkillSchema = z.object({
  key: slugSchema,
});

export const levelIdParamsSchema = z.object({
  levelId: cuidSchema,
});
