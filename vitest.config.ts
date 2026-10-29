import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // mongodb-memory-server downloads a mongod binary on first run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
