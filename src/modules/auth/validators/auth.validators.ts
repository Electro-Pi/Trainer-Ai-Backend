import { z } from 'zod';

import { emailSchema } from '@/common/validators/primitives.js';

export const microsoftCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const passwordLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
