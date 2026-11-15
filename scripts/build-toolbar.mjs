// Bundle the dev toolbar into one browser script (packages/toolbar/dist/luci-toolbar.js), which
// `luci serve` serves at /toolbar.js. Runs after `tsc -b` as part of `pnpm build`.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const entry = fileURLToPath(new URL('../packages/toolbar/src/script.ts', import.meta.url));
const outfile = fileURLToPath(new URL('../packages/toolbar/dist/luci-toolbar.js', import.meta.url));
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'LuciDevToolbar',
  platform: 'browser',
  target: 'chrome110',
  legalComments: 'none',
  logLevel: 'warning'
});
console.log(`built ${outfile}`);

const captureEntry = fileURLToPath(new URL('../packages/capture/src/browser.ts', import.meta.url));
const captureOutfile = fileURLToPath(new URL('../packages/capture/dist/luci-capture.js', import.meta.url));
await build({
  entryPoints: [captureEntry],
  outfile: captureOutfile,
  bundle: true,
  format: 'iife',
  globalName: 'LuciCapture',
  platform: 'browser',
  target: 'chrome110',
  legalComments: 'none',
  logLevel: 'warning'
});
console.log(`built ${captureOutfile}`);
