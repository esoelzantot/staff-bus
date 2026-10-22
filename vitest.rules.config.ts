import { defineConfig } from 'vitest/config';

// Tests that need the Firestore emulator – run them through it: npm run test:rules
//   tests/rules   security rules
//   tests/reset   the daily reset (Admin SDK, real transactions)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts', 'tests/reset/**/*.test.ts'],
    // all tests share one emulator, so run files one after another
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
