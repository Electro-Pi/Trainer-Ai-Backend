import { z } from 'zod';

import { cuidSchema, sortOrderSchema } from '@/common/validators/primitives.js';

const bilingualTextSchema = z.string().trim().min(1).max(500);
const levelNameSchema = z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']);
const contentTypeSchema = z.enum(['DOCUMENT', 'SLIDES', 'TEXT', 'LINK', 'IMAGE']);

export const planIdParamsSchema = z.object({
  id: cuidSchema,
});

export const skillSnapshotIdParamsSchema = z.object({
  id: cuidSchema,
  skillSnapshotId: cuidSchema,
});

export const outcomeSnapshotIdParamsSchema = z.object({
  id: cuidSchema,
  outcomeSnapshotId: cuidSchema,
});

export const contentSnapshotIdParamsSchema = z.object({
  id: cuidSchema,
  contentSnapshotId: cuidSchema,
});

export const addPlanSkillSnapshotSchema = z.object({
  nameEn: bilingualTextSchema,
  nameAr: bilingualTextSchema,
  levels: z.array(levelNameSchema).max(4),
});

export const updatePlanSkillSnapshotSchema = z
  .object({
    nameEn: bilingualTextSchema.optional(),
    nameAr: bilingualTextSchema.optional(),
    levels: z.array(levelNameSchema).max(4).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'At least one field is required' });

export const addPlanOutcomeSnapshotSchema = z.object({
  titleEn: bilingualTextSchema,
  titleAr: bilingualTextSchema,
  descriptionEn: z.string().trim().min(1).max(4000),
  descriptionAr: z.string().trim().min(1).max(4000),
  order: sortOrderSchema,
});

export const updatePlanOutcomeSnapshotSchema = z
  .object({
    titleEn: bilingualTextSchema.optional(),
    titleAr: bilingualTextSchema.optional(),
    descriptionEn: z.string().trim().min(1).max(4000).optional(),
    descriptionAr: z.string().trim().min(1).max(4000).optional(),
    order: sortOrderSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'At least one field is required' });

export const addPlanContentSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(200),
  contentType: contentTypeSchema,
  sourceUrl: z.url().max(2048).optional(),
  textBody: z.string().trim().min(1).max(20000).optional(),
});

export const updatePlanContentSnapshotSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    sourceUrl: z.url().max(2048).optional(),
    textBody: z.string().trim().min(1).max(20000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'At least one field is required' });
