import { z } from 'zod';

export const directorySearchFilterSchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export const directoryGroupIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(200),
});
