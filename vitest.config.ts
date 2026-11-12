import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the TypeScript sources, so no build is needed first
    // Exact matches, so the subpath "@luci/format/capture" is not caught by "@luci/format"
    alias: [
      { find: /^@luci\/format\/capture$/, replacement: fileURLToPath(new URL('./packages/format/src/capture/index.ts', import.meta.url)) },
      { find: /^@luci\/format$/, replacement: pkg('format') },
      { find: /^@luci\/brain$/, replacement: pkg('brain') },
      { find: /^@luci\/skills$/, replacement: pkg('skills') }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    globalSetup: ['./test-global-setup.ts'],
    setupFiles: ['./test-setup.ts']
  }
});
