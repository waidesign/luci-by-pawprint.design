import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the TypeScript sources, so no build is needed first
    // Exact matches, so the subpath "@luci/format/capture" is not caught by "@luci/format"
    alias: [
      { find: /^@(luci|luci-dev)\/format\/capture$/, replacement: fileURLToPath(new URL('./packages/format/src/capture/index.ts', import.meta.url)) },
      { find: /^@(luci|luci-dev)\/format\/feedback$/, replacement: fileURLToPath(new URL('./packages/format/src/feedback/index.ts', import.meta.url)) },
      { find: /^@(luci|luci-dev)\/format$/, replacement: pkg('format') },
      { find: /^@(luci|luci-dev)\/brain$/, replacement: pkg('brain') },
      { find: /^@(luci|luci-dev)\/skills$/, replacement: pkg('skills') },
      { find: /^@(luci|luci-dev)\/ui$/, replacement: pkg('ui') },
      { find: /^@(luci|luci-dev)\/capture$/, replacement: pkg('capture') },
      { find: /^@(luci|luci-dev)\/feedback$/, replacement: pkg('feedback') },
      { find: /^@(luci|luci-dev)\/toolbar$/, replacement: pkg('toolbar') },
      { find: /^@(luci|luci-dev)\/capture\/states$/, replacement: fileURLToPath(new URL('./packages/capture/src/states.ts', import.meta.url)) }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Browser tests (Chromium) run in parallel with the rest; 5s is too tight under that load
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // GitHub's shared macOS runners are slower and busier than a desktop: a browser test that loses a
    // timing race there gets two more tries. Never locally, so a flaky test still shows up on your machine
    retry: process.env['CI'] ? 2 : 0,
    globalSetup: ['./test-global-setup.ts'],
    setupFiles: ['./test-setup.ts']
  }
});
