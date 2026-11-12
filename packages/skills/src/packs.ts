/**
 * Skill packs (S8): small, curated sets of library skills for one kind of work.
 * `luci init` offers the packs that fit the project, judged from its dependencies,
 * files and goal. Adding a pack records its skills in .luci/skills.lock.json, tagged
 * with the pack, so removing it later takes out only what it added.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packSchema, parseJsonText, type SkillPack } from '@luci/format';
import { readLock, selectSkills, writeLock } from './project.js';
import type { SkillSource } from './types.js';

/** Luci's own packs, shipped in this package. */
export const PACKS_DIR = fileURLToPath(new URL('../packs/', import.meta.url));

/** What the pack rules need to know about a project. */
export interface PackProject {
  projectPath?: string;
  dependencies?: readonly string[];
  hasUi?: boolean;
}

/** Problems in one pack definition (empty when valid). Skill names are checked when `knownSkills` is given. */
export function validatePack(pack: unknown, knownSkills: ReadonlySet<string> | null = null): string[] {
  const parsed = packSchema.safeParse(pack);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.') || 'pack'}: ${i.message}`);
  const p = parsed.data;
  const problems: string[] = [];
  const s = p.signals;
  if (!s.always && !(['dependencies', 'dependencyPrefixes', 'files', 'goalWords'] as const).some(k => (s[k] ?? []).length)) {
    problems.push('"signals" needs at least one of always, dependencies, dependencyPrefixes, files, goalWords');
  }
  const names = [...(p.skills ?? []), ...(p.when ?? []).flatMap(w => w.skills)];
  if (!names.length && !p.fromGroup) problems.push('no skills');
  if (knownSkills) for (const n of names) if (!knownSkills.has(n)) problems.push(`unknown skill "${n}"`);
  return problems;
}

/** All valid packs in `dir`, sorted by name. Invalid files are skipped (tests check every shipped pack). */
export function loadPacks(dir: string = PACKS_DIR): SkillPack[] {
  if (!fs.existsSync(dir)) return [];
  const packs: SkillPack[] = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const json = parseJsonText(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (json.ok && validatePack(json.value).length === 0) packs.push(packSchema.parse(json.value));
  }
  return packs;
}

const depSet = (info: PackProject) => new Set((info.dependencies ?? []).map(d => String(d).toLowerCase()));

/** Why a pack fits this project (one reason per matching signal); [] when it doesn't. */
export function packReasons(pack: SkillPack, info: PackProject, options: { projectDir?: string; goal?: string } = {}): string[] {
  const projectDir = options.projectDir ?? info.projectPath;
  if (pack.requires?.hasUi && !info.hasUi) return [];
  const s = pack.signals;
  const installed = depSet(info);
  const reasons: string[] = [];

  const byName = (s.dependencies ?? []).filter(d => installed.has(d.toLowerCase()));
  const byPrefix = [...installed].filter(d => (s.dependencyPrefixes ?? []).some(p => d.startsWith(p.toLowerCase())));
  const packages = [...new Set([...byName, ...byPrefix])];
  if (packages.length) reasons.push(`${packages.slice(0, 3).join(', ')} ${packages.length > 1 ? 'are' : 'is'} in package.json`);

  const files = (s.files ?? []).filter(f => projectDir && fs.existsSync(path.join(projectDir, f)));
  if (files.length) reasons.push(`${files.join(', ')} found`);

  const text = String(options.goal ?? '').toLowerCase();
  const words = (s.goalWords ?? []).filter(w => new RegExp(`(^|[^a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text));
  if (words.length) reasons.push(`the goal mentions "${words.slice(0, 2).join('", "')}"`);

  if (!reasons.length && s.always) reasons.push(pack.requires?.hasUi ? 'the project has a user interface' : 'fits every project');
  return reasons;
}

/** The packs that fit a project. */
export function detectPacks(packs: readonly SkillPack[], info: PackProject, options: { projectDir?: string; goal?: string } = {}): { pack: SkillPack; reasons: string[] }[] {
  return packs.map(pack => ({ pack, reasons: packReasons(pack, info, options) })).filter(p => p.reasons.length);
}

/** The skills a pack adds to this project, in order, each with why. Skills missing from the library are listed apart. */
export async function packSkills(pack: SkillPack, info: PackProject, registry: SkillSource): Promise<{ skills: { id: string; reason: string }[]; missing: string[] }> {
  const installed = depSet(info);
  const out: { id: string; reason: string }[] = [];
  const missing: string[] = [];
  const add = async (id: string, reason: string) => {
    if (out.some(s => s.id === id)) return;
    if (await registry.getSkill(id)) out.push({ id, reason });
    else missing.push(id);
  };

  for (const id of pack.skills ?? []) await add(id, `Pack "${pack.name}"`);
  for (const rule of pack.when ?? []) {
    const dep = (rule.dependencies ?? []).find(d => installed.has(d.toLowerCase()));
    const file = !dep && info.projectPath ? (rule.files ?? []).find(f => fs.existsSync(path.join(info.projectPath ?? '', f))) : undefined;
    const why = dep ? `${dep} is installed` : file ? `${file} found` : null;
    if (why) for (const id of rule.skills) await add(id, `Pack "${pack.name}": ${why}`);
  }
  if (pack.fromGroup) {
    for (const skill of await registry.getAllSkills()) {
      if (skill.contract?.exclusiveGroup !== pack.fromGroup) continue;
      const hit = (skill.contract?.packages ?? []).find(p => installed.has(p.toLowerCase()));
      if (hit) await add(skill.id, `Pack "${pack.name}": ${hit} is installed`);
    }
  }
  return { skills: out, missing };
}

/** Names of packs added to this project (from the lockfile's pack tags). */
export function addedPacks(projectDir: string): string[] {
  return [...new Set(readLock(projectDir).skills.flatMap(s => s.packs ?? []))].sort();
}

/** Add a pack's skills to the project. Skills someone chose by hand are left as they are. */
export async function addPack(projectDir: string, registry: SkillSource, pack: SkillPack, info: PackProject): Promise<{ added: string[]; tagged: string[]; already: string[]; missing: string[] }> {
  const { skills, missing } = await packSkills(pack, info, registry);
  const result = { added: [] as string[], tagged: [] as string[], already: [] as string[], missing };
  for (const { id, reason } of skills) {
    const existing = readLock(projectDir).skills.find(s => s.id === id);
    if (!existing) {
      const res = await selectSkills(projectDir, registry, [id], reason, { packs: [pack.name] });
      if (res.added.length) result.added.push(id);
      continue;
    }
    if (!existing.packs) { result.already.push(id); continue; } // chosen by hand: not the pack's to manage
    if (existing.packs.includes(pack.name)) { result.already.push(id); continue; }
    const lock = readLock(projectDir);
    lock.skills = lock.skills.map(s => (s.id === id ? { ...s, packs: [...(s.packs ?? []), pack.name] } : s));
    writeLock(projectDir, lock);
    result.tagged.push(id);
  }
  return result;
}

/** Remove a pack: its tag comes off every skill, and skills no other pack (and no person) chose are deselected. */
export function removePack(projectDir: string, name: string): { removed: string[]; kept: string[] } {
  const lock = readLock(projectDir);
  const removed: string[] = [];
  const kept: string[] = [];
  const skills = [];
  for (const s of lock.skills) {
    if (!s.packs?.includes(name)) { skills.push(s); continue; }
    const others = s.packs.filter(p => p !== name);
    if (others.length) {
      // Keep the reason honest: it now stays because of another pack
      const reason = s.reason?.startsWith(`Pack "${name}"`) ? `Pack "${others[0]}"` : s.reason;
      skills.push({ ...s, ...(reason ? { reason } : {}), packs: others });
      kept.push(s.id);
    } else {
      removed.push(s.id);
    }
  }
  if (removed.length || kept.length) writeLock(projectDir, { ...lock, skills });
  return { removed, kept };
}
