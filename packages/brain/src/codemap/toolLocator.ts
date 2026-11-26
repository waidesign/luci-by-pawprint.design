import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Graphify prints Unicode; force UTF-8 so piped output can't crash it on Windows. */
export const TOOL_ENV: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };

export interface FoundTool {
  command: string;
  version: string;
}

/**
 * Folders where uv installs tools. Right after an install they may not be on PATH yet
 * (that needs a new terminal), so Luci also looks here directly.
 */
export function userBinDirs(): string[] {
  return [process.env['UV_TOOL_BIN_DIR'], process.env['XDG_BIN_HOME'], path.join(os.homedir(), '.local', 'bin')]
    .filter((d): d is string => Boolean(d));
}

/** Find a working command-line tool: on PATH first, then in the user bin folders. */
export function findTool(name: string): FoundTool | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const inBinDirs = userBinDirs().map(dir => path.join(dir, exe)).filter(p => fs.existsSync(p));
  for (const command of new Set([name, ...inBinDirs])) {
    try {
      const version = execFileSync(command, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', env: TOOL_ENV, timeout: 30_000 }).trim();
      return { command, version };
    } catch {
      // Not found or not working: try the next candidate
    }
  }
  return null;
}
