import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Build every package once before the tests, so tests can run the real `luci` binary. */
export default function setup(): void {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const tsc = fileURLToPath(new URL('./node_modules/typescript/bin/tsc', import.meta.url));
  const res = spawnSync(process.execPath, [tsc, '-b'], { cwd: root, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`Build failed before the tests:\n${res.stdout}${res.stderr}`);
}
