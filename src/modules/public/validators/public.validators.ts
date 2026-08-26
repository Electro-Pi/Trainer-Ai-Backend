import { z } from 'zod';

export const trackKeyParamsSchema = z.object({
  key: z.string().min(1).max(100),
});

/** `05XXXXXXXX`, `+9665XXXXXXXX`, or `9665XXXXXXXX` — see modrb.md field rules. */
const SAUDI_MOBILE_RE = /^(?:05\d{8}|(?:\+966|966)5\d{8})$/;

/**
 * `WS-01` — `website` is the honeypot: a hidden field real browsers never
 * fill, only fetched by naive bots submitting every field blindly. Kept
 * optional/nullable rather than rejected at the schema level so the request
 * still validates — `PublicService.submitDemoRequest` checks it and silently
 * drops honeypot-tripped submissions (never reveals detection to the caller).
 */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email(),
  company: z.string().trim().min(1).max(200),
  phone: z
    .string()
    .trim()
    .max(50)
    .regex(SAUDI_MOBILE_RE, {
      error: 'Phone must be a Saudi mobile number (05XXXXXXXX, +9665XXXXXXXX, or 9665XXXXXXXX)',
    })
    .optional(),
  message: z.string().trim().max(2000).optional(),
  locale: z.enum(['EN', 'AR']).default('EN'),
  website: z.string().max(500).optional(),
  /** GDPR — the public form's consent checkbox; a submission without it is rejected. */
  consentGiven: z.literal(true, {
    error: 'Consent to be contacted is required to submit a demo request',
  }),
});
