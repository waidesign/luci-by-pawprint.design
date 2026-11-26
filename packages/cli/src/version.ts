import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The CLI's version from its package.json (next to src/ and dist/). */
export function cliVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}
