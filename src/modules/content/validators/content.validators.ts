import { z } from 'zod';

import { cuidSchema, paginationSchema } from '@/common/validators/primitives.js';

const nameSchema = z.string().trim().min(1).max(300);

export const createContentSchema = z.object({
  skillId: cuidSchema,
  name: nameSchema,
});

export const updateContentSchema = z.object({
  name: nameSchema.optional(),
});

export const contentFilterSchema = paginationSchema.extend({
  skillId: cuidSchema.optional(),
});

export const contentIdParamsSchema = z.object({
  id: cuidSchema,
});

export const mediaIdParamsSchema = z.object({
  id: cuidSchema,
});
