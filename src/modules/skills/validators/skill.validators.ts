import { z } from 'zod';

import { cuidSchema, paginationSchema, slugSchema } from '@/common/validators/primitives.js';

const bilingualTextSchema = z.string().trim().min(1).max(500);
const levelNameSchema = z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']);

export const createSkillSchema = z.object({
  key: slugSchema,
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  category: z.string().trim().min(1).max(120),
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  targetTracks: z.array(z.string().trim().min(1).max(200)).max(50),
  levels: z.array(levelNameSchema).max(4),
  assessmentEnabled: z.boolean().optional(),
});

export const updateSkillSchema = z.object({
  nameEn: bilingualTextSchema.optional(),
  nameAr: bilingualTextSchema.optional(),
  category: z.string().trim().min(1).max(120).optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
  targetTracks: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  levels: z.array(levelNameSchema).max(4).optional(),
  assessmentEnabled: z.boolean().optional(),
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
