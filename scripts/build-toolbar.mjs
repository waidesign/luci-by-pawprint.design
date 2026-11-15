// Bundle the dev toolbar into one browser script (packages/toolbar/dist/luci-toolbar.js), which
// `luci serve` serves at /toolbar.js. Runs after `tsc -b` as part of `pnpm build`.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Keep LUCI_VERSION and extension package.json in sync with root package.json automatically
const rootPkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
const aboutPath = fileURLToPath(new URL('../packages/ui/src/about.ts', import.meta.url));
if (fs.existsSync(aboutPath) && rootPkg.version) {
  const current = fs.readFileSync(aboutPath, 'utf8');
  const updated = current.replace(/export const LUCI_VERSION = '[^']+';/, `export const LUCI_VERSION = '${rootPkg.version}';`);
  if (current !== updated) fs.writeFileSync(aboutPath, updated, 'utf8');
}
const extPkgPath = fileURLToPath(new URL('../packages/extension/package.json', import.meta.url));
if (fs.existsSync(extPkgPath) && rootPkg.version) {
  const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf8'));
  if (extPkg.version !== rootPkg.version) {
    extPkg.version = rootPkg.version;
    fs.writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n', 'utf8');
  }
}

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
