import path from 'path';
import { defineConfig } from 'vitest/config';

// Scope vitest to the app's colocated unit tests. worker/test/*.test.ts are
// node:test suites (run with `node --test` inside worker/) — without this
// exclude, vitest picks them up by glob and reports "No test suite found".
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
