import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
    setupFiles: ['./test/setup-environment.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
