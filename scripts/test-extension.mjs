// Run the extension tests including the one that loads it in Chromium (LUCI_EXTENSION_E2E=1).
// A script rather than an inline variable, so it works the same in PowerShell, cmd and sh.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const res = spawnSync(process.execPath, [vitest, 'run', 'packages/extension'], { cwd: root, stdio: 'inherit', env: { ...process.env, LUCI_EXTENSION_E2E: '1' } });
process.exit(res.status ?? 1);
