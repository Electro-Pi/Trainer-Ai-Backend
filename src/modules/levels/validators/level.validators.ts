import { z } from 'zod';

import { cuidSchema, slugSchema } from '@/common/validators/primitives.js';

const bilingualTextSchema = z.string().trim().min(1).max(500);

export const createLevelSchema = z.object({
  key: slugSchema,
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
});

export const updateLevelSchema = z.object({
  nameEn: bilingualTextSchema.optional(),
  nameAr: bilingualTextSchema.optional(),
  descriptionEn: z.string().trim().min(1).max(4000).optional(),
  descriptionAr: z.string().trim().min(1).max(4000).optional(),
});

export const trackIdParamsSchema = z.object({
  trackId: cuidSchema,
});

export const levelIdParamsSchema = z.object({
  id: cuidSchema,
});

export const setLevelEnabledSchema = z.object({
  isEnabled: z.boolean(),
});

export const reorderLevelsSchema = z.object({
  order: z.array(cuidSchema).min(1),
});
