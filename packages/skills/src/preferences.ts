/**
 * Skill preferences in the user's Global Brain (~/.luci/brain/skill-preferences.json):
 *   pinned   skills you trust and want considered first: a small ranking boost when
 *            they already fit the task (a pin never adds a skill that doesn't fit)
 *   blocked  skills Luci never suggests to you (naming one explicitly still works)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonText, skillPreferencesFile } from '@luci/format';

export const PIN_BOOST = 1.15;

export interface SkillPreferences {
  pinned: string[];
  blocked: string[];
  invalid?: boolean;
}

const EMPTY = (): SkillPreferences => ({ pinned: [], blocked: [] });
const uniqueSorted = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map(String))].sort();

export function readSkillPreferences(file: string = skillPreferencesFile()): SkillPreferences {
  if (!file || !fs.existsSync(file)) return EMPTY();
  const json = parseJsonText(fs.readFileSync(file, 'utf8'));
  if (!json.ok || !json.value || typeof json.value !== 'object') return { ...EMPTY(), invalid: true };
  const data = json.value as Record<string, unknown>;
  return { pinned: uniqueSorted(data['pinned']), blocked: uniqueSorted(data['blocked']) };
}

export function writeSkillPreferences(prefs: SkillPreferences, file: string = skillPreferencesFile()): SkillPreferences {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { pinned: uniqueSorted(prefs.pinned), blocked: uniqueSorted(prefs.blocked) };
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

export type PreferenceAction = 'pin' | 'unpin' | 'block' | 'unblock';

/**
 * Change preferences. Pinning a skill unblocks it and blocking unpins it, so a
 * skill is never both. Returns the IDs that changed and the saved preferences.
 */
export function updateSkillPreferences(action: PreferenceAction, ids: readonly string[], file: string = skillPreferencesFile()): { changed: string[]; prefs: SkillPreferences } {
  const prefs = readSkillPreferences(file);
  const pinned = new Set(prefs.pinned);
  const blocked = new Set(prefs.blocked);
  const changed: string[] = [];
  for (const id of ids) {
    const before = `${pinned.has(id)}|${blocked.has(id)}`;
    if (action === 'pin') { pinned.add(id); blocked.delete(id); }
    else if (action === 'unpin') pinned.delete(id);
    else if (action === 'block') { blocked.add(id); pinned.delete(id); }
    else blocked.delete(id);
    if (`${pinned.has(id)}|${blocked.has(id)}` !== before) changed.push(id);
  }
  const saved = changed.length ? writeSkillPreferences({ pinned: [...pinned], blocked: [...blocked] }, file) : prefs;
  return { changed, prefs: saved };
}
