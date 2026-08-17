import { z } from 'zod';

import { cuidSchema, nameSchema, paginationSchema } from '@/common/validators/primitives.js';

export const createDepartmentSchema = z.object({
  name: nameSchema,
});

export const updateDepartmentSchema = z.object({
  name: nameSchema.optional(),
  isEnabled: z.boolean().optional(),
});

export const departmentFilterSchema = paginationSchema;

export const departmentIdParamsSchema = z.object({
  id: cuidSchema,
});
