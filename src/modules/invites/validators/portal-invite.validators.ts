import { z } from 'zod';

import { emailSchema } from '@/common/validators/primitives.js';

export const createPortalInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(['DEPARTMENT_MANAGER', 'CONTENT_CREATOR']),
});

export const portalInviteIdParamsSchema = z.object({
  id: z.cuid2(),
});
