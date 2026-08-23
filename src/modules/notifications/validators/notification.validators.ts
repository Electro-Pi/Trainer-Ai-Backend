import { z } from 'zod';

import { cuidSchema } from '@/common/validators/primitives.js';

export const notificationIdParamsSchema = z.object({
  id: cuidSchema,
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z.coerce.boolean().optional(),
});
