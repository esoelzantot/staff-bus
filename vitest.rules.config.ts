import { defineConfig } from 'vitest/config';

// Firestore security-rules tests – run through the emulator: npm run test:rules
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // all tests share one emulator database, so run files one after another
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
