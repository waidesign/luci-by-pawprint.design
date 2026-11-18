/**
 * How Luci writes where a skill's instructions are, anywhere the text leaves this machine's terminal
 * (the committed skill catalog, the active task, an agent's tool results): never a path that names the
 * user's own folders.
 */
import path from 'node:path';
import { PRODUCT, luciHomeLabel, type HomeLabel } from '@luci-dev/format';
import type { Skill } from './types.js';

/**
 * A project skill relative to the project, a personal skill under Luci's home folder (`~/.luci/...`,
 * or `$LUCI_HOME/...` when set), always with forward slashes. Null for Luci's own library: its files
 * sit inside the installed package (under npx, in the user's npm cache), so it is named instead and
 * opened by name (see `openByName`).
 */
export function catalogPath(projectDir: string, skill: Pick<Skill, 'filePath' | 'library'>, home: HomeLabel = luciHomeLabel()): string | null {
  if (!skill.filePath) return null;
  const under = (root: string): string | null => {
    const rel = path.relative(path.resolve(root), path.resolve(skill.filePath!));
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : null;
  };
  if (skill.library === 'project') return under(projectDir);
  if (skill.library === 'personal') {
    const rel = under(home.dir);
    return rel ? `${home.label}/${rel}` : null;
  }
  return null;
}

/** How an agent opens a skill that has no path to show: by its name. */
export const openByName = (id: string): string =>
  `\`${PRODUCT.command} skills use ${id} --full\` or the MCP tool \`get_skill\` (\`${id}\`)`;
