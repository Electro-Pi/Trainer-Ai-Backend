import { z } from 'zod';

import { nameSchema } from '@/common/validators/primitives.js';

const languageSchema = z.enum(['EN', 'AR']);

export const updateOrganizationSchema = z
  .object({
    name: nameSchema.optional(),
    defaultLanguage: languageSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.defaultLanguage !== undefined, {
    error: 'At least one of name or defaultLanguage must be provided',
  });
