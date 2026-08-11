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

  UPLOADTHING_TOKEN: z.string().min(1, { error: 'UPLOADTHING_TOKEN is required' }),

  SCANNER_PROVIDER: z.enum(['fake', 'clamav']).default('fake'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),

  EMBEDDING_PROVIDER: z.enum(['fake', 'openai']).default('fake'),
  OPENAI_API_KEY: z.string().default(''),
  OCR_PROVIDER: z.enum(['fake', 'openai']).default('fake'),

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
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
  }

  const data = parsed.data;

  if (data.NODE_ENV === 'production') {
    const providerChecks: Array<[string, string]> = [
      ['GRAPH_PROVIDER', data.GRAPH_PROVIDER],
      ['AI_SERVICE_PROVIDER', data.AI_SERVICE_PROVIDER],
      ['SCANNER_PROVIDER', data.SCANNER_PROVIDER],
      ['EMBEDDING_PROVIDER', data.EMBEDDING_PROVIDER],
      ['OCR_PROVIDER', data.OCR_PROVIDER],
      ['EMAIL_PROVIDER', data.EMAIL_PROVIDER],
    ];
    const disallowedFakes = providerChecks.filter(([, value]) => value === 'fake');

    if (disallowedFakes.length > 0) {
      console.error(
        `❌ NODE_ENV=production but fake providers are configured: ${disallowedFakes
          .map(([key]) => key)
          .join(', ')}`,
      );
      process.exit(1);
    }

    if (data.CORS_ORIGINS.length === 0) {
      console.error('❌ NODE_ENV=production requires CORS_ORIGINS to be set');
      process.exit(1);
    }

    if (data.ADMIN_DASHBOARD_PASSWORD === '' || data.ADMIN_DASHBOARD_PASSWORD === 'admin') {
      console.error('❌ NODE_ENV=production requires a non-default ADMIN_DASHBOARD_PASSWORD');
      process.exit(1);
    }
  }

  return data;
}

export const env = loadEnv();
export type Env = typeof env;
