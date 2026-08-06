import { z } from 'zod';

import {
  emailSchema,
  nameSchema,
  paginationSchema,
  passwordSchema,
} from '@/common/validators/primitives.js';

const roleSchema = z.enum(['MANAGER', 'HR', 'CONTENT_MANAGER', 'ADMIN']);
const localeSchema = z.enum(['EN', 'AR']);

export const createPortalUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  password: passwordSchema.optional(),
  locale: localeSchema.optional(),
});

export const updatePortalUserSchema = z.object({
  name: nameSchema.optional(),
  role: roleSchema.optional(),
  locale: localeSchema.optional(),
  isActive: z.boolean().optional(),
});

export const portalUserFilterSchema = paginationSchema;

export const portalUserIdParamsSchema = z.object({
  id: z.cuid2(),
});
