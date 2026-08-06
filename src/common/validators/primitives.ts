import { z } from 'zod';

// Shared field-level primitives (ARCHITECTURE §6.2). Defined once; every
// module composes these instead of re-typing a field rule (AGENTS.md #3).

export const emailSchema = z.email().trim().toLowerCase().max(254);

// A small inline blocklist, not a full dictionary — enough to reject the
// most common weak passwords without shipping a dependency for it.
const COMMON_PASSWORDS = new Set([
  'password123!',
  'password1234',
  'qwerty123456',
  'letmein12345',
  'admin1234567',
  'welcome12345',
  'iloveyou1234',
  '123456789012',
]);

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, { error: 'Password must contain a lowercase letter' })
  .regex(/[A-Z]/, { error: 'Password must contain an uppercase letter' })
  .regex(/[0-9]/, { error: 'Password must contain a digit' })
  .regex(/[^a-zA-Z0-9]/, { error: 'Password must contain a symbol' })
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    error: 'Password is too common',
  });

export const phoneSchema = z.string().regex(/^\+?[1-9]\d{7,14}$/, {
  error: 'Phone must be a valid E.164 number',
});

export const cuidSchema = z.cuid2();

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'Must be a valid slug' })
  .max(60);

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine((value) => value.length > 0, { error: 'Must not be empty' });

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const estimatedMinutesSchema = z.coerce.number().int().positive().max(480);

export const weightSchema = z.coerce.number().int().min(1).max(100);

export const trainingDaysSchema = z.coerce.number().int().positive().max(365);

export const scoreSchema = z.coerce.number().int().min(0).max(100);

export const sortOrderSchema = z.coerce.number().int().nonnegative();

export const httpsUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    error: 'URL must use https',
  });
