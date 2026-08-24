import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globalSetup: ['./tests/setup/global-setup.ts'],
    setupFiles: ['./tests/setup/test-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Sequential — every test suite shares one Postgres/Redis container pair
    // and most integration tests mutate shared queue/rate-limit state keyed
    // by Redis, not just DB rows scoped by a fresh org id.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/config/**', 'src/swagger/**'],
    },
  },
});
