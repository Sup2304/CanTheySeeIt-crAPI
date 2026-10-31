import { defineConfig } from 'vitest/config';
// Node's native *.test.mjs suites are run separately; do not load them with Vitest.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
