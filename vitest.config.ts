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
    // vitest's 5s default is calibrated for unit tests that touch a few
    // functions. Half this suite is simulation SWEEPS — `score stays within
    // 0..999 over a wide sweep` alone replays 2,000 full careers, and the
    // reachability tests walk up to 6,000.
    //
    // That test measured 3,748ms locally, i.e. 25% under the default, and CI
    // duly failed it with "Test timed out in 5000ms" on a loaded runner. The
    // trigger was lengthening the gym chain from two leaders to three, which
    // made every simulated career ~50% more expensive — so the whole class of
    // sweeps moved, not just the one that happened to tip first.
    //
    // 30s is ~8x the slowest observed test: generous enough that ordinary
    // hardware variance cannot flake the suite, tight enough that a genuine
    // hang still fails rather than hanging the job to its 25-minute limit.
    testTimeout: 30_000,
  },
});
