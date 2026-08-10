import { execFileSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const ENV_FILE = path.resolve(import.meta.dirname, '../../.test-env.json');

/**
 * Runs once for the whole Vitest run (not per file/worker). Starts a real
 * Postgres container (pgvector image, matching docker-compose — also backs
 * the pg-boss job queue), applies every Prisma migration against the fresh
 * database, then writes the resolved connection string + a fresh
 * JWT/encryption keyset to a JSON file. Test files can't read
 * `project.provide()`/`inject()` values before `dotenv`-driven app modules
 * load, so a plain file handoff — read synchronously by
 * `tests/setup/test-env.ts` — is what actually gets these into `process.env`
 * before any `@/config/env.js` import happens.
 */
export async function setup(): Promise<void> {
  const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'pgvector/pgvector:pg16',
  )
    .withDatabase('trainer_ai_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const databaseUrl = postgres.getConnectionUri();

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Invoke Prisma's CLI entrypoint directly with `node`, bypassing the `npx`/
  // `.cmd` shim entirely — avoids Windows' `spawnSync ...cmd EINVAL` when
  // `execFileSync` is used without `shell: true` (and `shell: true` is a
  // command-injection footgun we don't need here).
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  // UploadThing has no local/sandbox container equivalent — tests hit the
  // real API, so the token must come from the invoking shell/CI secret, not
  // be generated like the other test-only credentials above.
  const uploadthingToken = process.env['UPLOADTHING_TOKEN'];
  if (!uploadthingToken) {
    throw new Error('UPLOADTHING_TOKEN must be set in the environment to run tests');
  }

  await writeFile(
    ENV_FILE,
    JSON.stringify({
      DATABASE_URL: databaseUrl,
      JWT_PRIVATE_KEY: Buffer.from(privateKey).toString('base64'),
      JWT_PUBLIC_KEY: Buffer.from(publicKey).toString('base64'),
      ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      UPLOADTHING_TOKEN: uploadthingToken,
      postgresContainerId: postgres.getId(),
    }),
    'utf8',
  );

  globalThis.__testContainers = { postgres };
}

export async function teardown(): Promise<void> {
  const containers = globalThis.__testContainers;
  await containers?.postgres.stop();
  await rm(ENV_FILE, { force: true });
}

declare global {
  var __testContainers: { postgres: StartedPostgreSqlContainer } | undefined;
}
