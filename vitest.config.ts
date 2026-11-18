import { defineConfig } from 'vitest/config';
// The external-template re-run opens 14 real files; it takes ~2s locally but exceeded the 5s default on a Windows CI runner.
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30_000 } });
