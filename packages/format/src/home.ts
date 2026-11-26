import os from 'node:os';
import path from 'node:path';
import { PRODUCT } from './product.js';

/**
 * Luci's per-user folder. Defaults to ~/.luci; set LUCI_HOME to move it, for
 * example into a synced folder, to share one Global Brain across machines.
 * Computes a path only; nothing is read or written.
 */
export function luciHome(): string {
  const env = process.env[PRODUCT.homeEnv];
  return env ? path.resolve(env) : path.join(os.homedir(), PRODUCT.homeDir);
}

/** The user's Global Brain: cross-project preferences and decisions. */
export const userBrainDir = () => path.join(luciHome(), 'brain');

/** The user's personal skill library: skills added with `luci skills add`. */
export const userSkillsDir = () => path.join(luciHome(), 'skills');

/** Pinned and blocked skills, part of the Global Brain. */
export const skillPreferencesFile = () => path.join(userBrainDir(), 'skill-preferences.json');

/** Luci's per-user folder and how it is written for others to read: `$LUCI_HOME` when set, else `~/.luci`. */
export interface HomeLabel {
  dir: string;
  label: string;
}
export const luciHomeLabel = (): HomeLabel => ({
  dir: luciHome(),
  label: process.env[PRODUCT.homeEnv] ? `$${PRODUCT.homeEnv}` : `~/${PRODUCT.homeDir}`
});

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A folder as it can appear in text: either slash style, and JSON-escaped (doubled backslashes). */
const folderForms = (dir: string) =>
  [...new Set([dir, dir.replace(/\\/g, '/'), dir.replace(/\//g, '\\'), dir.replace(/\//g, '\\').replace(/\\/g, '\\\\')])]
    .sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
/** The folder itself or anything under it, up to a character that cannot be part of a path in text. */
const folderPattern = (dir: string, flags: string) =>
  new RegExp(`(?:${folderForms(dir)})(?=$|[\\\\/\\s"'\`|)\\]>,;:])([\\\\/][^\\s"'\`|)\\]>,;]*)?`, flags);

/**
 * Text with no path into the user's own folders: a path under Luci's folder becomes `~/.luci/...`
 * (or `$LUCI_HOME/...`), any other path under the home folder becomes `~/...`, always with forward
 * slashes. For output that leaves this machine's terminal (an agent's tool results), so it never names
 * the user. Folders in `keep` (the project an agent works in) are left as they are. Both slash styles
 * and JSON-escaped backslashes are recognised, case-insensitively on Windows.
 */
export function hideHomePaths(text: string, options: { home?: HomeLabel; homeDir?: string; keep?: readonly string[] } = {}): string {
  const home = options.home ?? luciHomeLabel();
  const homeDir = options.homeDir ?? os.homedir();
  const flags = process.platform === 'win32' ? 'gi' : 'g';
  const usable = (dir: string | undefined): dir is string => Boolean(dir) && path.parse(dir!).root !== dir;
  // Set the kept folders aside first, so a project under the home folder keeps its real path
  const kept: string[] = [];
  let out = text;
  for (const dir of (options.keep ?? []).filter(usable)) {
    out = out.replace(folderPattern(dir, flags), m => `\u0000${kept.push(m) - 1}\u0000`);
  }
  for (const [dir, label] of [[home.dir, home.label], [homeDir, '~']] as const) {
    if (!usable(dir)) continue;
    out = out.replace(folderPattern(dir, flags), (_m, rest: string | undefined) => `${label}${(rest ?? '').replace(/\\{1,2}/g, '/')}`);
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)]!);
}
