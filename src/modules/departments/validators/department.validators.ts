import { z } from 'zod';

import { cuidSchema, nameSchema, paginationSchema } from '@/common/validators/primitives.js';

export const createDepartmentSchema = z.object({
  nameEn: nameSchema,
  nameAr: nameSchema,
  isEnabled: z.boolean().optional(),
});

export const updateDepartmentSchema = z.object({
  nameEn: nameSchema.optional(),
  nameAr: nameSchema.optional(),
  isEnabled: z.boolean().optional(),
});

export const departmentFilterSchema = paginationSchema;

export const departmentIdParamsSchema = z.object({
  id: cuidSchema,
});
