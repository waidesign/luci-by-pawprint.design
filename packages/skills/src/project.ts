/**
 * The skills a project uses. Library skills chosen for the project are recorded in
 * .luci/skills.lock.json; the project's own skills live in .luci/skills/. The catalog
 * .luci/project-skills.md is generated: one short entry per skill, so agents open a
 * full skill only when a task needs it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LSS_VERSION, MEMORY_FILES, PRODUCT, formatSkillLock, parseJsonText, type LockEntry, type SkillLock } from '@luci/format';
import { SkillOrchestrator, type LoadedTask } from './orchestrator.js';
import { SkillRegistry } from './registry.js';
import { describeTrust, needsCaution, trustLevel } from './trust.js';
import type { Skill, SkillSource } from './types.js';

const memory = (projectDir: string) => path.join(projectDir, PRODUCT.projectDir);
const lockPath = (projectDir: string) => path.join(memory(projectDir), MEMORY_FILES.skillsLock);
const today = () => new Date().toISOString().slice(0, 10);
const rel = (file: string) => `${PRODUCT.projectDir}/${file}`;

export interface ReadLock extends SkillLock {
  invalid?: boolean;
}

/** The project's skill selection. A missing file is an empty selection; an invalid one is flagged. */
export function readLock(projectDir: string): ReadLock {
  const file = lockPath(projectDir);
  if (!fs.existsSync(file)) return { lss: LSS_VERSION, skills: [] };
  const json = parseJsonText(fs.readFileSync(file, 'utf8'));
  const value = json.ok ? (json.value as { skills?: unknown }) : null;
  if (!value || !Array.isArray(value.skills)) return { lss: LSS_VERSION, skills: [], invalid: true };
  const skills = value.skills.filter((s): s is LockEntry => Boolean(s && typeof s === 'object' && typeof (s as LockEntry).id === 'string'));
  return { lss: LSS_VERSION, skills };
}

export function writeLock(projectDir: string, lock: SkillLock): void {
  fs.mkdirSync(memory(projectDir), { recursive: true });
  fs.writeFileSync(lockPath(projectDir), formatSkillLock({ lss: LSS_VERSION, skills: lock.skills }), 'utf8');
}

/** Add library skills to the project, recording version, reason and date. */
export async function selectSkills(projectDir: string, registry: SkillSource, ids: readonly string[], reason = '', options: { packs?: string[] } = {}): Promise<{ added: string[]; already: string[]; unknown: string[] }> {
  const lock = readLock(projectDir);
  const result = { added: [] as string[], already: [] as string[], unknown: [] as string[] };
  for (const id of ids) {
    const skill = await registry.getSkill(id);
    if (!skill) { result.unknown.push(id); continue; }
    if (lock.skills.some(s => s.id === id)) { result.already.push(id); continue; }
    const entry: LockEntry = { id, version: skill.version, reason: reason || 'Selected for this project.', addedAt: today() };
    if (skill.library && skill.library !== 'official') entry.library = skill.library;
    if (skill.contract?.source?.repo) entry.from = `https://github.com/${skill.contract.source.repo}`;
    // Added by a pack: removing the pack may take it out again; skills chosen by hand have no tag
    if (options.packs?.length) entry.packs = options.packs;
    lock.skills.push(entry);
    result.added.push(id);
  }
  if (result.added.length) writeLock(projectDir, lock);
  return result;
}

/** Remove skills from the project. Returns the IDs removed. */
export function deselectSkills(projectDir: string, ids: readonly string[]): string[] {
  const lock = readLock(projectDir);
  const removed = lock.skills.filter(s => ids.includes(s.id)).map(s => s.id);
  if (removed.length) writeLock(projectDir, { ...lock, skills: lock.skills.filter(s => !ids.includes(s.id)) });
  return removed;
}

/** Registry over the project's own skills (.luci/skills), without writing an index into the project. */
export const projectSkillRegistry = (projectDir: string) =>
  new SkillRegistry({ skillsDir: path.join(memory(projectDir), MEMORY_FILES.skills), library: 'project', autoIndex: false });

/**
 * Copy a skill into the project (.luci/skills/<id>) so everyone who clones the project
 * has it, then remove it from the lockfile (it is now a project skill).
 */
export function shareSkillWithProject(projectDir: string, skill: Pick<Skill, 'id' | 'dir'>): { dir: string } {
  const dest = path.join(memory(projectDir), MEMORY_FILES.skills, skill.id);
  if (fs.existsSync(dest)) throw new Error(`This project already has a skill named "${skill.id}" in ${rel(`${MEMORY_FILES.skills}/`)}.`);
  if (!skill.dir) throw new Error(`The skill "${skill.id}" has no folder to copy.`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(skill.dir, dest, { recursive: true, filter: (src) => path.basename(src) !== 'index.json' });
  deselectSkills(projectDir, [skill.id]);
  return { dir: dest };
}

/** Human-readable reasons for selected skills this machine doesn't have. */
export function missingSkillWarnings(lock: SkillLock, missing: readonly string[]): string[] {
  if (!missing.length) return [];
  const byId = new Map(lock.skills.map(s => [s.id, s]));
  const personal = missing.filter(id => byId.get(id)?.library === 'personal');
  const other = missing.filter(id => !personal.includes(id));
  const out: string[] = [];
  if (personal.length) {
    out.push(`Selected skills that live only in someone's personal library: ${personal.join(', ')}. Ask whoever selected them to run \`${PRODUCT.command} skills share <name>\` so they are committed with the project${personal.some(id => byId.get(id)?.from) ? `, or add them from their source with \`${PRODUCT.command} skills add <link>\`` : ''}.`);
  }
  if (other.length) out.push(`Selected skills not found in the ${PRODUCT.name} library: ${other.join(', ')}.`);
  return out;
}

export interface ProjectSkillSet extends SkillSource {
  selected: Skill[];
  own: Skill[];
  missing: string[];
}

/** The skills this project uses: library skills selected in the lockfile plus the project's own. */
export async function projectSkillSet(projectDir: string, library: SkillSource): Promise<ProjectSkillSet> {
  const lock = readLock(projectDir);
  const selected: Skill[] = [];
  const missing: string[] = [];
  for (const entry of lock.skills) {
    const skill = await library.getSkill(entry.id);
    // A wrapper with the selection attached; the shared registry object (and its lazy body) stay untouched
    if (skill) selected.push(Object.assign(Object.create(skill) as Skill, { selection: entry }));
    else missing.push(entry.id);
  }
  const own = await projectSkillRegistry(projectDir).getAllSkills();
  const all = [...selected, ...own.filter(s => !selected.some(x => x.id === s.id))];
  const byId = new Map(all.map(s => [s.id, s]));
  return {
    selected,
    own,
    missing,
    getAllSkills: async () => all,
    getSkill: async (id: string) => byId.get(id) ?? null,
    ...(library.preferences ? { preferences: library.preferences } : {})
  };
}

const firstItems = (list: unknown, n: number) => (Array.isArray(list) ? list.slice(0, n).map(String) : []);

/** Write .luci/project-skills.md: a short catalog agents read instead of full skills. */
export async function writeCatalog(projectDir: string, library: SkillSource): Promise<ProjectSkillSet> {
  const set = await projectSkillSet(projectDir, library);
  const lines = [
    '# Project Skills',
    '',
    `_Generated by ${PRODUCT.name} from \`${rel(MEMORY_FILES.skillsLock)}\` and \`${rel(`${MEMORY_FILES.skills}/`)}\`. Do not edit; use \`${PRODUCT.command} skills select\` / \`${PRODUCT.command} skills deselect\`._`,
    '',
    `These are the skills chosen for this project. **Open a skill only when the current task needs it**, or ask ${PRODUCT.name} for the ones that fit a task (MCP tool \`load_project_skills\`).`,
    ''
  ];
  if (set.selected.length === 0 && set.own.length === 0) lines.push(`No skills selected yet. Add some with \`${PRODUCT.command} skills select <skill-name>\`.`);

  const entry = (skill: Skill, origin: 'library' | 'project') => {
    const c = skill.contract ?? {};
    const out = [`### ${skill.name} (\`${skill.id}\`)`, '', c.summary || skill.description];
    const when = firstItems(c.whenToUse, 2);
    if (when.length) out.push('', `**When to use**: ${when.join(' ')}`);
    if (skill.selection?.reason) out.push(`**Why chosen**: ${skill.selection.reason}`);
    if (trustLevel(skill) !== 'official') out.push(`**Source**: ${describeTrust(skill)}`);
    if ((c.permissions ?? []).includes('shell')) {
      out.push(needsCaution(skill)
        ? `**Can run commands, not reviewed by ${PRODUCT.name}**: show the user any command from this skill before running it.`
        : '**Can run commands**: review its scripts before running them.');
    }
    const file = origin === 'project'
      ? path.relative(projectDir, skill.filePath ?? '').replace(/\\/g, '/')
      : (skill.filePath ?? '').replace(/\\/g, '/');
    out.push(`**Full instructions** (~${skill.tokenEstimate ?? '?'} tokens): \`${file}\``, '');
    return out.join('\n');
  };

  if (set.selected.length) {
    lines.push(`## Selected from the ${PRODUCT.name} library`, '');
    for (const s of set.selected) lines.push(entry(s, 'library'));
  }
  if (set.own.length) {
    lines.push(`## Project skills (\`${rel(`${MEMORY_FILES.skills}/`)}\`)`, '');
    for (const s of set.own) lines.push(entry(s, 'project'));
  }
  for (const w of missingSkillWarnings(readLock(projectDir), set.missing)) lines.push('', `_${w}_`);

  fs.mkdirSync(memory(projectDir), { recursive: true });
  fs.writeFileSync(path.join(memory(projectDir), MEMORY_FILES.skillCatalog), `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`, 'utf8');
  return set;
}

/** Skills for a task, chosen only among the project's skills: close matches within the token budget. */
export async function loadProjectSkillsForTask(projectDir: string, library: SkillSource, taskPrompt: string, options: { tokenBudget?: number } = {}): Promise<LoadedTask> {
  const set = await projectSkillSet(projectDir, library);
  return new SkillOrchestrator(set).loadSkillsForTask(taskPrompt, {}, options);
}
