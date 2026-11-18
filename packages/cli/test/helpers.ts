import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { CliContext } from '../src/index.js';

const made: string[] = [];
let defaultBinDir: string | null = null;
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function ensureDefaultBinDir(): string {
  if (defaultBinDir && fs.existsSync(defaultBinDir)) return defaultBinDir;
  defaultBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-cli-bin-'));
  fs.writeFileSync(path.join(defaultBinDir, 'luci'), '#!/bin/sh\n', 'utf8');
  fs.writeFileSync(path.join(defaultBinDir, 'luci.cmd'), '@echo off\r\n', 'utf8');
  return defaultBinDir;
}

export function tempDir(prefix = 'luci-cli-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

export function tempProject(files: Record<string, string> = { 'package.json': JSON.stringify({ name: 'demo' }) }): string {
  const dir = tempDir('luci-cli-project-');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

/** A context that records output and answers questions from a script. */
export function fakeContext(cwd: string, options: { isTTY?: boolean; answers?: string[]; pathEnv?: string; platform?: NodeJS.Platform } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const answers = [...(options.answers ?? [])];
  const ctx: CliContext = {
    cwd,
    out: (line = '') => out.push(line),
    err: (line = '') => err.push(line),
    isTTY: options.isTTY ?? false,
    ask: async (q) => { asked.push(q); return answers.shift() ?? ''; },
    pathEnv: options.pathEnv ?? ensureDefaultBinDir(),
    ...(options.platform !== undefined ? { platform: options.platform } : {})
  };
  return { ctx, out, err, asked, text: () => out.join('\n'), errors: () => err.join('\n') };
}

export const readMemory = (dir: string, rel: string) => fs.readFileSync(path.join(dir, '.luci', rel), 'utf8');
