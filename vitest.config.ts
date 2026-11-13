import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the TypeScript sources, so no build is needed first
    // Exact matches, so the subpath "@luci/format/capture" is not caught by "@luci/format"
    alias: [
      { find: /^@luci\/format\/capture$/, replacement: fileURLToPath(new URL('./packages/format/src/capture/index.ts', import.meta.url)) },
      { find: /^@luci\/format\/feedback$/, replacement: fileURLToPath(new URL('./packages/format/src/feedback/index.ts', import.meta.url)) },
      { find: /^@luci\/format$/, replacement: pkg('format') },
      { find: /^@luci\/brain$/, replacement: pkg('brain') },
      { find: /^@luci\/skills$/, replacement: pkg('skills') },
      { find: /^@luci\/capture$/, replacement: pkg('capture') },
      { find: /^@luci\/feedback$/, replacement: pkg('feedback') },
      { find: /^@luci\/toolbar$/, replacement: pkg('toolbar') },
      { find: /^@luci\/capture\/states$/, replacement: fileURLToPath(new URL('./packages/capture/src/states.ts', import.meta.url)) }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Browser tests (Chromium) run in parallel with the rest; 5s is too tight under that load
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test-global-setup.ts'],
    setupFiles: ['./test-setup.ts']
  }
});
