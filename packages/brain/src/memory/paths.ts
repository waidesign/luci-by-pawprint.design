import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCT } from '@luci/format';

/**
 * Luci's per-user folder. Defaults to ~/.luci; set LUCI_HOME to move it, for
 * example into a synced folder, to share one Global Brain across machines.
 */
export function luciHome(): string {
  const env = process.env[PRODUCT.homeEnv];
  return env ? path.resolve(env) : path.join(os.homedir(), PRODUCT.homeDir);
}

/** The user's Global Brain: cross-project preferences and decisions. */
export function userBrainDir(): string {
  return path.join(luciHome(), 'brain');
}

/** Default Global Brain files shipped with Luci, copied into a new user's brain. */
export const DEFAULT_BRAIN_DIR = fileURLToPath(new URL('../../defaults/', import.meta.url));
