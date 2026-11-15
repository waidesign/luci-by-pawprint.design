import { fileURLToPath } from 'node:url';

export { luciHome, userBrainDir } from '@luci-dev/format';

/** Default Global Brain files shipped with Luci, copied into a new user's brain. */
export const DEFAULT_BRAIN_DIR = fileURLToPath(new URL('../../defaults/', import.meta.url));
