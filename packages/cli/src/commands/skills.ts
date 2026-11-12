import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT, userSkillsDir } from '@luci/format';
import { convertPrototypeSkillFolder, detectProject, memoryDir, writeActiveTask } from '@luci/brain';
import {
  GitHubClient,
  SkillDiscovery,
  SkillOrchestrator,
  SkillRegistry,
  applyLicense,
  approveDrafts,
  deselectSkills,
  describeTrust,
  explainMatch,
  installSkill,
  lintLibrary,
  listDrafts,
  loadProjectSkillsForTask,
  prepareSkill,
  previewSkill,
  projectSkillSet,
  rejectDrafts,
  resolveSkillLicense,
  selectSkills,
  shareSkillWithProject,
  trustLevel,
  updateSkillPreferences,
  writeCatalog,
  type PreferenceAction,
  type Skill
} from '@luci/skills';
import type { CliContext, Command } from '../context.js';

const cmd = (args: string) => `${PRODUCT.command} ${args}`;

export const SKILLS_HELP = `skills [category]     List the skill library (Luci's and your personal one)
  skills search <query>         Find skills by keyword
  skills recommend <task>       Skills for a task, each with the reason
  skills use <task> [--project] [--budget <tokens>] [--full] [--inject]
                        Load the skills that closely match a task (nothing when nothing fits);
                        --project: only this project's skills; --full: print their instructions;
                        --inject: write the task and the skill files to open into .luci/local/active-task.md
  skills select <name...> [--reason <text>]   Use library skills in this project
  skills deselect <name...>     Stop using skills in this project
  skills selected               The skills this project uses
  skills add <github-link|folder|file> [--project] [--category <c>] [--name <n>] [--yes]
                        Add a skill to your personal library (or this project); converted to the
                        Luci Skill Standard. A GitHub link is fetched from GitHub (network).
  skills mine                   Your personal library
  skills share <name>           Copy a personal skill into this project for teammates
  skills lint [folder] [--levels]  Check skills against the standard and show ranking levels
  skills pin|unpin|block|unblock <name...>   Prefer or never suggest skills
  skills prefs                  Show pinned and blocked skills
  skills review [name] [--approve | --reject] [field...]   Review AI-drafted ranking fields
  skills licenses [--apply]     Check personal skills' licences at their source (network)
  skills index                  Rebuild the index of your personal library`;

const registryFor = () => new SkillRegistry({ user: true });

/** Options with a value: --reason "..." and the like. */
function takeOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, value !== undefined && !value.startsWith('--') ? 2 : 1);
  return value !== undefined && !value.startsWith('--') ? value : undefined;
}
function takeFlag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const tags = (s: Skill, prefs: { pinned: string[]; blocked: string[] }) => {
  const t: string[] = [trustLevel(s)];
  if (s.overrides) t.push(`replaces the ${s.overrides} one`);
  if (prefs.pinned.includes(s.id)) t.push('pinned');
  if (prefs.blocked.includes(s.id)) t.push('blocked');
  return `[${t.join(' · ')}]`;
};
const short = (text: string, n = 90) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
};

function needProject(ctx: CliContext): boolean {
  if (fs.existsSync(memoryDir(ctx.cwd))) return true;
  ctx.err(`No ${PRODUCT.projectDir}/ here. Run \`${cmd('init')}\` first.`);
  return false;
}

async function list(args: string[], ctx: CliContext): Promise<number> {
  const registry = registryFor();
  const category = args[0];
  const skills = category ? await registry.getSkillsByCategory(category) : await registry.getAllSkills();
  if (!skills.length) {
    ctx.out(category ? `No skills in category "${category}". Categories: ${(await registry.getCategories()).join(', ')}` : 'No skills found.');
    return category ? 1 : 0;
  }
  const byCategory = new Map<string, Skill[]>();
  for (const s of skills) byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);
  ctx.out(`${skills.length} skill${skills.length === 1 ? '' : 's'}${category ? ` in ${category}` : ''}:`);
  for (const [cat, list] of [...byCategory].sort((a, b) => a[0].localeCompare(b[0]))) {
    ctx.out(`\n${cat}`);
    for (const s of list.sort((a, b) => a.id.localeCompare(b.id))) ctx.out(`  ${s.id.padEnd(28)} ${tags(s, registry.preferences)} ${short(s.description, 70)}`);
  }
  return 0;
}

async function search(args: string[], ctx: CliContext): Promise<number> {
  const query = args.join(' ').trim();
  if (!query) { ctx.err(`Usage: ${cmd('skills search <query>')}`); return 1; }
  const results = await new SkillDiscovery(registryFor()).search(query, { limit: 10, withScores: true });
  if (!results.length) { ctx.out(`No skills match "${query}".`); return 0; }
  ctx.out(`Skills for "${query}":`);
  for (const r of results) ctx.out(`  ${r.skill.id.padEnd(28)} [${trustLevel(r.skill)}] ${explainMatch(r)}`);
  return 0;
}

async function recommend(args: string[], ctx: CliContext): Promise<number> {
  const task = args.join(' ').trim();
  if (!task) { ctx.err(`Usage: ${cmd('skills recommend <task>')}`); return 1; }
  const info = fs.existsSync(path.join(ctx.cwd, 'package.json')) ? detectProject(ctx.cwd) : null;
  const recs = await new SkillOrchestrator(registryFor()).recommend(task, info ? { dependencies: info.dependencies, framework: info.framework } : {});
  const all = [...recs.primarySkills, ...recs.supportingSkills, ...recs.dependencies];
  if (!all.length) { ctx.out('No skill in the library closely matches this task, so none is recommended.'); return 0; }
  for (const s of all) ctx.out(`  ${s.id.padEnd(28)} [${s.trust}] ${s.reason}`);
  for (const e of recs.excluded) ctx.out(`  left out: ${e.id}: ${e.reason}`);
  for (const c of recs.conflicts) ctx.out(`  note: ${c.skills.join(' / ')}: ${c.resolution}`);
  return 0;
}

async function use(args: string[], ctx: CliContext): Promise<number> {
  const projectOnly = takeFlag(args, '--project');
  const full = takeFlag(args, '--full');
  const inject = takeFlag(args, '--inject');
  const budgetText = takeOption(args, '--budget');
  const task = args.join(' ').trim();
  if (!task) { ctx.err(`Usage: ${cmd('skills use <task> [--project] [--budget <tokens>] [--full]')}`); return 1; }
  const tokenBudget = budgetText ? Number(budgetText) : undefined;
  if (budgetText && (!Number.isFinite(tokenBudget) || (tokenBudget ?? 0) <= 0)) { ctx.err('--budget needs a positive number of tokens.'); return 1; }
  const registry = registryFor();
  const info = fs.existsSync(path.join(ctx.cwd, 'package.json')) ? detectProject(ctx.cwd) : null;
  const options = tokenBudget ? { tokenBudget } : {};
  const loaded = projectOnly
    ? (needProject(ctx) ? await loadProjectSkillsForTask(ctx.cwd, registry, task, options) : null)
    : await new SkillOrchestrator(registry).loadSkillsForTask(task, info ? { dependencies: info.dependencies, framework: info.framework } : {}, options);
  if (!loaded) return 1;
  if (inject) {
    if (!needProject(ctx)) return 1;
    if (!loaded.skills.length) {
      ctx.out(`No skill closely matches this task, so ${PRODUCT.projectDir}/${MEMORY_FILES.activeTask} was left unchanged. Name skills directly: ${cmd('skills use "<skill-id> <skill-id>" --inject')}`);
      return 0;
    }
    // A small pointer (which skill files to open and why), not the skill text; --full also embeds it
    let content = new SkillOrchestrator(registry).formatTaskPointer(loaded, { projectDir: ctx.cwd, ...(info ? { projectInfo: info } : {}) });
    if (full) content += `\n## Full skill instructions (--full)\n\n${loaded.formattedInstructions.replace(/^# .*\n+/, '')}`;
    const { file, archived } = writeActiveTask(ctx.cwd, content);
    ctx.out(`Wrote the active task (~${Math.round(content.length / 4)} tokens) to ${file}`);
    if (archived) ctx.out(`The previous task was archived to ${archived}.`);
    for (const s of loaded.skills) ctx.out(`  ${s.id}: ${s.reason}`);
    ctx.out(`Agents read it while its Status is active. When the task is finished: ${cmd('task done')}`);
    return 0;
  }
  if (full) { ctx.out(loaded.formattedInstructions); return 0; }
  if (!loaded.skills.length) {
    ctx.out(`No skill${projectOnly ? ' in this project' : ' in the library'} closely matches this task, so none is loaded.`);
    return 0;
  }
  ctx.out(`Skills for: ${task}  (budget ${loaded.tokenBudget} tokens)`);
  for (const s of loaded.skills) {
    ctx.out(`  ${s.id}  [${s.trust}]  ${s.mode === 'full' ? `full, ~${s.fullTokens} tokens` : 'summary only (over budget)'}`);
    ctx.out(`    Why: ${s.reason}`);
    ctx.out(`    File: ${s.filePath ?? '(none)'}`);
    if (s.caution) ctx.out(`    Caution: can run commands and is not reviewed by ${PRODUCT.name}; check its commands before running them.`);
  }
  if (loaded.baseline) ctx.out(`  For every UI change: ${loaded.baseline.id} (${loaded.baseline.filePath ?? ''})`);
  for (const e of loaded.excludedSkills) ctx.out(`  left out: ${e.id}: ${e.reason}`);
  for (const c of loaded.conflictResolutions) ctx.out(`  note: ${c.skills.join(' / ')}: ${c.resolution}`);
  ctx.out(`\nPrint the instructions with: ${cmd(`skills use "${task}"${projectOnly ? ' --project' : ''} --full`)}`);
  return 0;
}

async function select(args: string[], ctx: CliContext): Promise<number> {
  if (!needProject(ctx)) return 1;
  const reason = takeOption(args, '--reason') ?? '';
  if (!args.length) { ctx.err(`Usage: ${cmd('skills select <name...> [--reason <text>]')}`); return 1; }
  const registry = registryFor();
  const res = await selectSkills(ctx.cwd, registry, args, reason);
  await writeCatalog(ctx.cwd, registry);
  if (res.added.length) ctx.out(`Selected for this project: ${res.added.join(', ')}`);
  if (res.already.length) ctx.out(`Already selected: ${res.already.join(', ')}`);
  if (res.unknown.length) ctx.err(`Not found: ${res.unknown.join(', ')} (search with: ${cmd('skills search "<keyword>"')})`);
  ctx.out(`Updated ${PRODUCT.projectDir}/${MEMORY_FILES.skillsLock} and ${MEMORY_FILES.skillCatalog}.`);
  return res.unknown.length ? 1 : 0;
}

async function deselect(args: string[], ctx: CliContext): Promise<number> {
  if (!needProject(ctx)) return 1;
  if (!args.length) { ctx.err(`Usage: ${cmd('skills deselect <name...>')}`); return 1; }
  const removed = deselectSkills(ctx.cwd, args);
  await writeCatalog(ctx.cwd, registryFor());
  ctx.out(removed.length ? `No longer used in this project: ${removed.join(', ')}` : 'None of those skills were selected.');
  return 0;
}

async function selected(_args: string[], ctx: CliContext): Promise<number> {
  if (!needProject(ctx)) return 1;
  const set = await projectSkillSet(ctx.cwd, registryFor());
  if (!set.selected.length && !set.own.length) { ctx.out(`No skills yet. Add some with: ${cmd('skills select <name>')} or ${cmd('packs')}`); return 0; }
  for (const s of set.selected) ctx.out(`  ${s.id.padEnd(28)} [${trustLevel(s)}${s.selection?.packs ? ` · pack ${s.selection.packs.join(', ')}` : ''}] ${s.selection?.reason ?? ''}`);
  for (const s of set.own) ctx.out(`  ${s.id.padEnd(28)} [project] ${short(s.description, 70)}`);
  for (const id of set.missing) ctx.err(`  ${id}: selected but not found on this machine`);
  return 0;
}

async function add(args: string[], ctx: CliContext): Promise<number> {
  const toProject = takeFlag(args, '--project');
  const yes = takeFlag(args, '--yes');
  const category = takeOption(args, '--category');
  const name = takeOption(args, '--name');
  const target = args[0];
  if (!target) { ctx.err(`Usage: ${cmd('skills add <github-link|folder|file> [--project] [--category <c>] [--name <n>] [--yes]')}`); return 1; }
  if (toProject && !needProject(ctx)) return 1;

  const isGitHub = /^https?:\/\/github\.com\//.test(target);
  if (isGitHub) ctx.out(`Fetching from GitHub (network): ${target}`);
  // A skill folder from the earlier prototype is converted first, so its contract (author, keywords) is kept
  const local = isGitHub ? null : path.resolve(ctx.cwd, target);
  const converted = local && fs.existsSync(local) && fs.statSync(local).isDirectory() ? convertPrototypeSkillFolder(local) : null;
  let staged: string | null = null;
  if (converted) {
    staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'luci-skill-')), path.basename(local!));
    for (const [rel, text] of Object.entries(converted)) {
      fs.mkdirSync(path.dirname(path.join(staged, rel)), { recursive: true });
      fs.writeFileSync(path.join(staged, rel), text, 'utf8');
    }
    ctx.out('Converted from the earlier prototype\'s skill format.');
  }
  try {
    return await addPrepared(staged ?? local ?? target, isGitHub, { toProject, yes, category, name }, ctx);
  } finally {
    if (staged) fs.rmSync(path.dirname(staged), { recursive: true, force: true });
  }
}

async function addPrepared(
  source: string,
  isGitHub: boolean,
  opts: { toProject: boolean; yes: boolean; category: string | undefined; name: string | undefined },
  ctx: CliContext
): Promise<number> {
  const { toProject, yes, category, name } = opts;
  const prepared = await prepareSkill(source, isGitHub ? { github: new GitHubClient() } : {});
  const root = toProject ? path.join(memoryDir(ctx.cwd), MEMORY_FILES.skills) : userSkillsDir();
  const preview = previewSkill(prepared, { root, flat: toProject, ...(category ? { category } : {}), ...(name ? { name } : {}) });

  ctx.out(`\n${preview.name} -> ${preview.dir}`);
  ctx.out(`  Category: ${preview.category} (${preview.categorySource})`);
  ctx.out(`  Licence:  ${String(preview.data['license'] ?? 'UNKNOWN')} (${prepared.license.evidence})`);
  ctx.out(`  Ranking level: ${preview.levelName}${preview.levelMissing.length ? ` (missing: ${preview.levelMissing.join(', ')})` : ''}`);
  ctx.out(`  Supporting files: ${preview.support.selected.length}${preview.split ? `; split into SKILL.md + ${preview.split.references.length} reference file(s)` : ''}`);
  for (const w of preview.warnings) ctx.out(`  ! ${w}`);

  if (fs.existsSync(path.join(preview.dir, 'SKILL.md'))) { ctx.err(`A skill named "${preview.name}" already exists at ${preview.dir}.`); return 1; }
  if ((preview.contract.permissions ?? []).includes('shell') && !yes) {
    const answer = ctx.isTTY && ctx.ask ? (await ctx.ask('\nThis skill can run commands on your computer. Add it anyway? (y/N) ')).trim().toLowerCase() : '';
    if (answer !== 'y' && answer !== 'yes') {
      ctx.err(ctx.isTTY ? 'Not added.' : `Not added: this skill can run commands. Review it, then run again with --yes.`);
      return 1;
    }
  }
  const { dir, copied } = await installSkill(prepared, preview);
  ctx.out(`\nAdded ${preview.name} (${copied} supporting file${copied === 1 ? '' : 's'} copied) to ${toProject ? 'this project' : 'your personal library'}: ${dir}`);
  if (toProject) await writeCatalog(ctx.cwd, registryFor());
  else ctx.out(`Use it in a project with: ${cmd(`skills select ${preview.name}`)}`);
  return 0;
}

async function mine(_args: string[], ctx: CliContext): Promise<number> {
  const registry = registryFor();
  const personal = (await registry.getAllSkills()).filter(s => s.library === 'personal');
  ctx.out(`Personal library: ${registry.personalDir}`);
  if (!personal.length) { ctx.out(`  (empty) Add skills with: ${cmd('skills add <github-link|folder|file>')}`); return 0; }
  for (const s of personal) ctx.out(`  ${s.id.padEnd(28)} ${tags(s, registry.preferences)} ${short(s.description, 70)}`);
  return 0;
}

async function share(args: string[], ctx: CliContext): Promise<number> {
  if (!needProject(ctx)) return 1;
  const id = args[0];
  if (!id) { ctx.err(`Usage: ${cmd('skills share <name>')}`); return 1; }
  const registry = registryFor();
  const skill = await registry.getSkill(id);
  if (!skill) { ctx.err(`Not found: ${id}`); return 1; }
  const { dir } = shareSkillWithProject(ctx.cwd, skill);
  await writeCatalog(ctx.cwd, registry);
  ctx.out(`Copied ${id} into this project: ${path.relative(ctx.cwd, dir)}. Commit it so teammates have it.`);
  return 0;
}

async function lint(args: string[], ctx: CliContext): Promise<number> {
  const levels = takeFlag(args, '--levels');
  const folder = args[0] ? path.resolve(ctx.cwd, args[0]) : (fs.existsSync(path.join(memoryDir(ctx.cwd), MEMORY_FILES.skills)) ? path.join(memoryDir(ctx.cwd), MEMORY_FILES.skills) : userSkillsDir());
  if (!fs.existsSync(folder)) { ctx.err(`Not found: ${folder}`); return 1; }
  const result = lintLibrary(folder);
  ctx.out(`Checked ${result.results.length} skill${result.results.length === 1 ? '' : 's'} in ${folder}`);
  for (const r of result.results) {
    if (!r.errors.length && !r.warnings.length && !levels) continue;
    ctx.out(`\n${r.name}${levels ? ` [${r.levelName}]` : ''}`);
    for (const e of r.errors) ctx.out(`  error: ${e}`);
    for (const w of r.warnings) ctx.out(`  warning: ${w}`);
    if (levels && r.missing?.length) ctx.out(`  next level needs: ${r.missing.join(', ')}`);
  }
  if (levels) ctx.out(`\nLevels: ${result.levels.map(l => `${l.name} ${l.count}`).join(', ')}`);
  ctx.out(`\n${result.errorCount} error${result.errorCount === 1 ? '' : 's'}, ${result.warningCount} warning${result.warningCount === 1 ? '' : 's'}.`);
  return result.errorCount ? 1 : 0;
}

async function preference(action: PreferenceAction, args: string[], ctx: CliContext): Promise<number> {
  if (!args.length) { ctx.err(`Usage: ${cmd(`skills ${action} <name...>`)}`); return 1; }
  const registry = registryFor();
  await registry.ensureLoaded();
  const unknown = args.filter(id => !registry.skills.has(id));
  const known = args.filter(id => registry.skills.has(id));
  if (unknown.length) ctx.err(`Not found: ${unknown.join(', ')}`);
  if (!known.length) return 1;
  const { changed } = updateSkillPreferences(action, known, registry.preferencesFile ?? undefined);
  const effect = {
    pin: `${PRODUCT.name} considers them first when they fit a task.`,
    unpin: 'They rank like any other skill again.',
    block: `${PRODUCT.name} will not suggest them. You can still use one by naming it: ${cmd('skills use "<skill-name>"')}`,
    unblock: `${PRODUCT.name} may suggest them again.`
  }[action];
  const done = { pin: 'Pinned', unpin: 'Unpinned', block: 'Blocked', unblock: 'Unblocked' }[action];
  if (changed.length) ctx.out(`${done}: ${changed.join(', ')}. ${effect}`);
  const same = known.filter(id => !changed.includes(id));
  if (same.length) ctx.out(`No change for: ${same.join(', ')}`);
  return unknown.length ? 1 : 0;
}

async function prefs(_args: string[], ctx: CliContext): Promise<number> {
  const registry = registryFor();
  await registry.ensureLoaded();
  const p = registry.preferences;
  ctx.out(`Skill preferences (${registry.preferencesFile}):`);
  if (p.invalid) ctx.err('  The file is not valid JSON; pins and blocks are ignored until it is fixed.');
  ctx.out(`  Pinned:  ${p.pinned.join(', ') || '(none)'}`);
  ctx.out(`  Blocked: ${p.blocked.join(', ') || '(none)'}`);
  return 0;
}

async function review(args: string[], ctx: CliContext): Promise<number> {
  const approve = takeFlag(args, '--approve');
  const reject = takeFlag(args, '--reject');
  const registry = registryFor();
  const writable = (await registry.getAllSkills()).filter(s => s.library !== 'official');
  const [id, ...fields] = args;
  const targets = id ? writable.filter(s => s.id === id) : writable;
  if (id && !targets.length) {
    ctx.err(`No personal or project skill named "${id}" (Luci's own library is reviewed before release).`);
    return 1;
  }
  if (approve || reject) {
    if (!id) { ctx.err(`Name the skill: ${cmd('skills review <name> --approve [field...]')}`); return 1; }
    const skill = targets[0];
    if (!skill?.dir) return 1;
    const done = approve ? approveDrafts(skill.dir, fields.length ? fields : null) : rejectDrafts(skill.dir, fields.length ? fields : null);
    ctx.out(done.length ? `${approve ? 'Approved' : 'Rejected'} for ${skill.id}: ${done.join(', ')}` : `${skill.id} has no drafts${fields.length ? ` for ${fields.join(', ')}` : ''}.`);
    return 0;
  }
  let any = false;
  for (const s of targets) {
    const drafts = listDrafts(s.contract);
    if (!Object.keys(drafts).length) continue;
    any = true;
    ctx.out(`\n${s.id} (${describeTrust(s)})`);
    for (const [field, value] of Object.entries(drafts)) ctx.out(`  ${field}: ${JSON.stringify(value)}`);
    ctx.out(`  Approve: ${cmd(`skills review ${s.id} --approve`)}   Reject: ${cmd(`skills review ${s.id} --reject`)}`);
  }
  if (!any) ctx.out('No drafted fields waiting for review. Drafted fields are ignored for ranking until a person approves them.');
  return 0;
}

async function licenses(args: string[], ctx: CliContext): Promise<number> {
  const apply = takeFlag(args, '--apply');
  const registry = registryFor();
  const withSource = (await registry.getAllSkills()).filter(s => s.library === 'personal' && s.contract.source?.repo);
  if (!withSource.length) { ctx.out('No personal skills with a GitHub source to check.'); return 0; }
  ctx.out(`Checking ${withSource.length} licence${withSource.length === 1 ? '' : 's'} on GitHub (network)...`);
  const github = new GitHubClient();
  for (const s of withSource) {
    const source = s.contract.source!;
    const result = await resolveSkillLicense(github, { repo: source.repo!, ...(source.path ? { path: source.path } : {}) });
    ctx.out(`  ${s.id.padEnd(28)} ${result.spdx ?? 'UNKNOWN'} (${result.category}; ${result.evidence})`);
    if (apply && s.dir) applyLicense(s.dir, result);
  }
  if (!apply) ctx.out(`Record the results with: ${cmd('skills licenses --apply')}`);
  return 0;
}

async function index(_args: string[], ctx: CliContext): Promise<number> {
  const dir = userSkillsDir();
  if (!fs.existsSync(dir)) { ctx.out('Your personal library is empty; nothing to index.'); return 0; }
  const written = new SkillRegistry({ skillsDir: dir, library: 'personal' }).writeIndex();
  ctx.out(`Indexed ${written.skills.length} personal skill${written.skills.length === 1 ? '' : 's'} in ${dir}`);
  return 0;
}

const SUBCOMMANDS: Readonly<Record<string, (args: string[], ctx: CliContext) => Promise<number>>> = {
  list, search, recommend, use, select, deselect, selected, add, mine, share, lint, prefs, review, licenses, index,
  pin: (a, c) => preference('pin', a, c),
  unpin: (a, c) => preference('unpin', a, c),
  block: (a, c) => preference('block', a, c),
  unblock: (a, c) => preference('unblock', a, c)
};

export const skillsCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (!sub) return list([], ctx);
  const handler = SUBCOMMANDS[sub];
  // `luci skills <category>` lists one category
  if (!handler) return list([sub], ctx);
  return handler([...rest], ctx);
};
