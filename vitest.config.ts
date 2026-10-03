import { defineConfig } from 'vitest/config';

// Unit tests (pure logic + the sign-in flow with fakes). The Firestore rules tests need the emulator and run
// separately: npm run test:rules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
