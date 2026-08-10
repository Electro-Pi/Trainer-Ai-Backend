import { readFileSync } from 'node:fs';
import path from 'node:path';

// Vitest's `setupFiles` run inside each test file's own module graph, before
// that file's imports resolve — this is what lets us stamp `process.env`
// ahead of any `@/config/env.js` import triggered transitively by importing
// `@/app.js` or a repository. Must stay a plain `.ts` file with zero `@/*`
// imports so it never itself pulls `env.ts` in first.
const envFile = path.resolve(import.meta.dirname, '../../.test-env.json');
const testEnv = JSON.parse(readFileSync(envFile, 'utf8')) as Record<string, string>;

process.env['NODE_ENV'] = 'test';
// A dedicated port, distinct from the dev server's :3000 — tests that need a
// real listening server (e.g. the report-send job fetching a local-storage
// signed URL back over HTTP) bind to this exact port.
process.env['APP_URL'] = 'http://localhost:4100';
process.env['CORS_ORIGINS'] = 'http://localhost:3001';
process.env['DATABASE_URL'] = testEnv['DATABASE_URL'];
process.env['REDIS_URL'] = testEnv['REDIS_URL'];
process.env['JWT_PRIVATE_KEY'] = testEnv['JWT_PRIVATE_KEY'];
process.env['JWT_PUBLIC_KEY'] = testEnv['JWT_PUBLIC_KEY'];
process.env['ENCRYPTION_KEY'] = testEnv['ENCRYPTION_KEY'];
process.env['GRAPH_PROVIDER'] = 'fake';
process.env['AI_SERVICE_PROVIDER'] = 'fake';
process.env['AI_SERVICE_TOKEN'] = 'test-service-token';
process.env['UPLOADTHING_TOKEN'] = testEnv['UPLOADTHING_TOKEN'];
process.env['SCANNER_PROVIDER'] = 'fake';
process.env['EMBEDDING_PROVIDER'] = 'fake';
process.env['OCR_PROVIDER'] = 'fake';
process.env['EMAIL_PROVIDER'] = 'fake';
process.env['GRAPH_WEBHOOK_CLIENT_STATE'] = 'test-webhook-client-state';
