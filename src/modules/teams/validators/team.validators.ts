import { z } from 'zod';

import { cuidSchema, nameSchema, paginationSchema } from '@/common/validators/primitives.js';

const descriptionSchema = z.string().trim().max(2000);

export const createTeamSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  managerId: cuidSchema.optional(),
});

export const updateTeamSchema = z.object({
  name: nameSchema.optional(),
  description: descriptionSchema.optional(),
  managerId: cuidSchema.optional(),
});

export const teamFilterSchema = paginationSchema;

export const teamIdParamsSchema = z.object({
  id: cuidSchema,
});
