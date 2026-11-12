import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A throwaway project folder with these files (paths may include folders). Removed after each test. */
export function tempProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-project-'));
  made.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

export const pkg = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'demo', ...extra }, null, 2);

export const readMemory = (dir: string, rel: string) => fs.readFileSync(path.join(dir, '.luci', rel), 'utf8');
export const memoryExists = (dir: string, rel: string) => fs.existsSync(path.join(dir, '.luci', rel));

/** Every file under a folder, as forward-slash relative paths. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}
