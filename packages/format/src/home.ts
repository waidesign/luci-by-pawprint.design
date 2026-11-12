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
