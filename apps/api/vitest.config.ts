import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const core = (p: string) => fileURLToPath(new URL(`../../packages/core/src/${p}`, import.meta.url));

export default defineConfig({
  // Resolve @trao/core to its TypeScript source so tests never load a stale dist build
  // (two copies of core meant `instanceof LlmError` silently failed).
  resolve: {
    alias: [
      { find: '@trao/core/testing', replacement: core('testing/index.ts') },
      { find: '@trao/core', replacement: core('index.ts') },
    ],
  },
  test: { include: ['src/**/*.test.ts'], fileParallelism: false, testTimeout: 30_000 },
});
