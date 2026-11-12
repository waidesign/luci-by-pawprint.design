import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the TypeScript sources, so no build is needed first
    alias: {
      '@luci/format': pkg('format'),
      '@luci/brain': pkg('brain'),
      '@luci/skills': pkg('skills')
    }
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    globalSetup: ['./test-global-setup.ts'],
    setupFiles: ['./test-setup.ts']
  }
});
