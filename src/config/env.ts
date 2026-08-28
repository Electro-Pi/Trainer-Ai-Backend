import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
  QUEUE_POOL_MAX: z.coerce.number().int().positive().default(5),
  // Lets a dev machine skip pg-boss entirely when working against the
  // shared remote DB (a starved `max_connections` — see MEMORY.md — means
  // every extra local worker pool makes it worse for everyone else).
  WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),

  JWT_PRIVATE_KEY: z.string().min(1, { error: 'JWT_PRIVATE_KEY is required' }),
  JWT_PUBLIC_KEY: z.string().min(1, { error: 'JWT_PUBLIC_KEY is required' }),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().min(1, { error: 'ENCRYPTION_KEY is required' }),

  GRAPH_PROVIDER: z.enum(['fake', 'real']).default('fake'),
  GRAPH_CLIENT_ID: z.string().default(''),
  GRAPH_CLIENT_SECRET: z.string().default(''),
  GRAPH_TENANT_ID: z.string().default('common'),
  GRAPH_REDIRECT_URI: z.string().default(''),
  GRAPH_WEBHOOK_CLIENT_STATE: z.string().default('dev-webhook-client-state'),

  AI_SERVICE_PROVIDER: z.enum(['fake', 'real']).default('fake'),
  AI_SERVICE_BASE_URL: z.string().default(''),
  AI_SERVICE_TOKEN: z.string().default(''),

  // ── AI Trainer microservice (separate host — slide decks + external
  // live-session dispatch, see modules/ai-trainer) ──────────────────
  AI_TRAINER_HOST: z.string().default(''),

  UPLOADTHING_TOKEN: z.string().min(1, { error: 'UPLOADTHING_TOKEN is required' }),

  EMAIL_PROVIDER: z.enum(['fake', 'smtp', 'graph']).default('fake'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.email().default('no-reply@modrb.app'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  ADMIN_DASHBOARD_USER: z.string().default('admin'),
  ADMIN_DASHBOARD_PASSWORD: z.string().default(''),

  // ── MODRB central Contact Dashboard (lead forwarding) ─────
  MODRB_LEADS_URL: z.string().default('https://demo.testdevelopment.top:6542/api/leads'),
  MODRB_LEADS_API_KEY: z.string().default(''),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
