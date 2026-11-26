/**
 * Checks behind `luci doctor` (B5): the install, the user's Global Brain and the
 * current project's memory folder. Every problem comes with the fix. Reads only.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  DEFAULT_AGENTS,
  MEMORY_FILES,
  PRODUCT,
  PROJECT_GOAL_HEADING,
  TEMPLATE_DIRS,
  TEMPLATE_FILES,
  parseActiveTaskHeader,
  parseDecision,
  parseProposal,
  stripBom,
  type ActiveTaskHeader,
  type AgentId
} from '@luci-dev/format';
import { SkillRegistry, missingSkillWarnings, projectSkillSet, readLock, type SkillSource } from '@luci-dev/skills';
import { configureAgent, projectAgents } from '../agents/agentFiles.js';
import { hasCodeFiles, mapFreshness } from '../codemap/codeMap.js';
import { readAllPackageRules, readPackageRules, readProjectGoal, readProjectRules } from '../context/projectContext.js';
import { detectProject, type WorkspacePackage } from '../detect/detector.js';
import { TEMPLATES_DIR, findProjectRoot, memoryDir, memoryPath, readBrainJson } from '../layout/brainLayout.js';
import { detectProjectRuleConflicts } from '../memory/conflicts.js';
import { DEFAULT_BRAIN_DIR, userBrainDir } from '../memory/paths.js';

export type CheckStatus = 'ok' | 'info' | 'warn' | 'fail';

export interface Check {
  area: 'install' | 'project';
  status: CheckStatus;
  label: string;
  /** What was found. */
  detail?: string;
  /** How to fix it; set for every warn and fail. */
  fix?: string;
}

export interface ProjectSummary {
  name: string;
  framework: string;
  goal: string | null;
  projectRules: number;
  packageRules?: number;
  activePackage?: WorkspacePackage | null;
  packages?: WorkspacePackage[];
  activeTask: ActiveTaskHeader | null;
  pendingProposals: number;
  /** Library skills selected plus project skills. */
  skills: number;
  hasCodeMap: boolean;
}

export interface Diagnosis {
  checks: Check[];
  /** Present when the folder has .luci/. */
  project: ProjectSummary | null;
  ok: boolean;
}

export interface DiagnoseOptions {
  globalBrainDir?: string;
  /** For tests; defaults to the running Node. */
  nodeVersion?: string;
  templatesDir?: string;
  defaultsDir?: string;
  /** The skill library (default: Luci's library plus the user's personal one). */
  registry?: SkillSource;
  /** PATH string for tests; defaults to process.env.PATH. */
  pathEnv?: string;
  /** Platform for tests; defaults to process.platform. */
  platform?: NodeJS.Platform;
}

const MIN_NODE_MAJOR = 18;
const run = (args: string) => `\`${PRODUCT.command} ${args}\``;

export const GLOBAL_INSTALL_TIP = 'Install once for short commands: npm install -g @luci-dev/cli';
export const WINDOWS_POWERSHELL_TIP = 'In PowerShell, if `luci` is blocked, use `luci.cmd`.';

/**
 * Whether `luci` is installed on the user's real PATH (ignoring temporary npx cache
 * folders and project-local node_modules/.bin shims).
 */
export function isLuciOnPath(
  pathEnv: string | undefined = process.env.PATH ?? process.env.Path,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (!pathEnv) return false;
  const names = platform === 'win32' ? ['luci.cmd', 'luci.exe', 'luci.ps1', 'luci'] : ['luci'];
  for (const raw of pathEnv.split(platform === 'win32' ? ';' : ':')) {
    const dir = raw.trim().replace(/^"+|"+$/g, '');
    if (!dir) continue;
    if (/[\\/]_npx[\\/]/i.test(dir) || /[\\/]node_modules[\\/]\.bin[\\/]?$/i.test(dir)) continue;
    for (const name of names) {
      try {
        if (fs.statSync(path.join(dir, name)).isFile()) return true;
      } catch {
        // Not in this folder
      }
    }
  }
  return false;
}
const markdownFiles = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort() : [];

function installChecks(options: DiagnoseOptions): Check[] {
  const checks: Check[] = [];
  const version = options.nodeVersion ?? process.version;
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? 0);
  checks.push(major >= MIN_NODE_MAJOR
    ? { area: 'install', status: 'ok', label: 'Node.js', detail: version }
    : { area: 'install', status: 'fail', label: 'Node.js', detail: `${version} is too old`, fix: `Install Node.js ${MIN_NODE_MAJOR} or later.` });

  const templatesDir = options.templatesDir ?? TEMPLATES_DIR;
  const defaultsDir = options.defaultsDir ?? DEFAULT_BRAIN_DIR;
  const missing = [
    ...[...TEMPLATE_FILES, ...TEMPLATE_DIRS.map(d => `${d}/README.md`)].filter(f => !fs.existsSync(path.join(templatesDir, f))).map(f => `templates/${f}`),
    ...(fs.existsSync(defaultsDir) ? [] : ['defaults/'])
  ];
  checks.push(missing.length
    ? { area: 'install', status: 'fail', label: `${PRODUCT.name} files`, detail: `missing ${missing.join(', ')}`, fix: `Reinstall ${PRODUCT.name}.` }
    : { area: 'install', status: 'ok', label: `${PRODUCT.name} files`, detail: 'templates and defaults present' });

  const brainDir = options.globalBrainDir ?? userBrainDir();
  const moved = process.env[PRODUCT.homeEnv] ? ` (${PRODUCT.homeEnv} is set)` : '';
  if (!fs.existsSync(brainDir)) {
    checks.push({ area: 'install', status: 'warn', label: 'Global Brain', detail: `${brainDir} does not exist yet${moved}`, fix: `${run('init')} in any project creates it.` });
  } else {
    try {
      fs.accessSync(brainDir, fs.constants.W_OK);
      const files = fs.readdirSync(brainDir).filter(f => f.endsWith('.md')).length;
      checks.push({ area: 'install', status: 'ok', label: 'Global Brain', detail: `${brainDir}${moved}, ${files} files` });
    } catch {
      checks.push({ area: 'install', status: 'fail', label: 'Global Brain', detail: `${brainDir} is not writable`, fix: `Give your user write access to it, or set ${PRODUCT.homeEnv} to another folder.` });
    }
  }

  const platform = options.platform ?? process.platform;
  if (!isLuciOnPath(options.pathEnv, platform)) {
    checks.push({
      area: 'install',
      status: 'warn',
      label: 'PATH',
      detail: `\`${PRODUCT.command}\` is not on the PATH`,
      fix: platform === 'win32' ? `${GLOBAL_INSTALL_TIP} (${WINDOWS_POWERSHELL_TIP})` : GLOBAL_INSTALL_TIP
    });
  }
  return checks;
}

const LOADER_SCRIPT_EXT = ['tsx', 'jsx', 'js', 'ts'];
const LOADER_INSTALLED = /luci:toolbar|127\.0\.0\.1:(\d+)\/toolbar\.js/;

function findSupportedRootFile(projectDir: string): { file: string; rel: string } | null {
  const isFile = (f: string) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  const first = (names: readonly string[]) => names.map(n => path.join(projectDir, n)).find(isFile);
  const check = (file: string | undefined): { file: string; rel: string } | null => {
    if (!file) return null;
    try {
      const content = stripBom(fs.readFileSync(file, 'utf8'));
      return /<\/body>/i.test(content) ? { file, rel: path.relative(projectDir, file).replace(/\\/g, '/') } : null;
    } catch {
      return null;
    }
  };
  const astroLayout = () => {
    const dir = path.join(projectDir, 'src', 'layouts');
    let layouts: string[] = [];
    try { layouts = fs.readdirSync(dir).filter(f => f.endsWith('.astro')); } catch { /* none */ }
    const pick = layouts.find(f => /^(Base)?Layout\.astro$/i.test(f)) ?? (layouts.length === 1 ? layouts[0] : undefined);
    return check(pick ? path.join(dir, pick) : undefined);
  };
  const candidates: (() => { file: string; rel: string } | null)[] = [
    () => check(first(['app', 'src/app'].flatMap(d => LOADER_SCRIPT_EXT.map(e => `${d}/layout.${e}`)))),
    () => check(first(['pages', 'src/pages'].flatMap(d => LOADER_SCRIPT_EXT.map(e => `${d}/_document.${e}`)))),
    () => check(first(['src/app.html'])),
    astroLayout,
    () => check(first(['index.html'])),
    () => check(first(['src/index.html'])),
    () => check(first(['public/index.html']))
  ];
  for (const c of candidates) {
    const found = c();
    if (found) return found;
  }
  return null;
}

interface ServeStatus {
  running: boolean;
  ok: boolean;
  project?: string;
}

function isServeListening(port: number): Promise<ServeStatus> {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 500 }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ running: true, ok: false });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve({
            running: true,
            ok: Boolean(parsed && parsed.ok === true),
            project: typeof parsed?.project === 'string' ? parsed.project : undefined
          });
        } catch {
          resolve({ running: true, ok: false });
        }
      });
    });
    req.on('error', () => resolve({ running: false, ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false, ok: false }); });
  });
}

function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

async function skillChecks(dir: string, registry: SkillSource, add: (status: CheckStatus, label: string, detail?: string, fix?: string) => void): Promise<number> {
  const lock = readLock(dir);
  if (lock.invalid) {
    add('warn', 'Skill selection', `${memoryPath(MEMORY_FILES.skillsLock)} is not valid, so no library skills are selected`, `Fix the JSON, or delete the file and select skills again with ${run('skills select <name>')}.`);
    return 0;
  }
  const set = await projectSkillSet(dir, registry);
  for (const w of missingSkillWarnings(lock, set.missing)) add('warn', 'Skill selection', w, `${run('skills deselect <name>')} removes a selection you no longer need.`);
  if (!fs.existsSync(path.join(memoryDir(dir), MEMORY_FILES.skillCatalog))) {
    add('warn', 'Skill catalog', `${memoryPath(MEMORY_FILES.skillCatalog)} is missing; agents won't see the project's skills`, `${run('init')} writes it.`);
  } else if (!set.missing.length) {
    add('ok', 'Skills', `${set.selected.length} from the library, ${set.own.length} project skill${set.own.length === 1 ? '' : 's'}`);
  }
  return set.selected.length + set.own.length;
}

async function projectChecks(
  dir: string,
  registry: SkillSource,
  globalBrainDir: string,
  location?: { subPath: string; isInside: boolean }
): Promise<{ checks: Check[]; project: ProjectSummary | null }> {
  const root = memoryDir(dir);
  const checks: Check[] = [];
  const add = (status: CheckStatus, label: string, detail?: string, fix?: string) =>
    checks.push({ area: 'project', status, label, ...(detail ? { detail } : {}), ...(fix ? { fix } : {}) });

  if (!fs.existsSync(root)) {
    add('fail', 'Project memory', `no ${PRODUCT.projectDir}/ in ${dir}`, `${run('init')} here sets the project up.`);
    return { checks, project: null };
  }
  const restore = `${run('init')} restores missing files and keeps the ones you edited.`;

  const brain = readBrainJson(dir);
  if (!brain) add('fail', 'brain.json', `${memoryPath(MEMORY_FILES.brain)} is missing`, restore);
  else if (!brain.ok) add('fail', 'brain.json', brain.error, `Fix the file, or run ${run('init')} to rewrite it (keys you added are kept).`);
  else add('ok', 'brain.json', `layout ${brain.value.layout}`);

  const expected = [...TEMPLATE_FILES, ...TEMPLATE_DIRS.map(d => `${d}/README.md`)];
  const missing = expected.filter(f => !fs.existsSync(path.join(root, f)));
  if (missing.length) add('warn', 'Memory files', `missing ${missing.map(memoryPath).join(', ')}`, restore);
  else add('ok', 'Memory files', `${expected.length} files`);

  const gitignore = path.join(root, MEMORY_FILES.local, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    add('fail', 'Private notes', `${memoryPath(`${MEMORY_FILES.local}/.gitignore`)} is missing, so local/ could be committed`, `${run('init')} adds it.`);
  } else {
    add('ok', 'Private notes', `${memoryPath(`${MEMORY_FILES.local}/`)} is kept out of git`);
  }
  if (!fs.existsSync(path.join(root, MEMORY_FILES.globalBrainSummary))) {
    add('warn', 'Global Brain summary', `${memoryPath(MEMORY_FILES.globalBrainSummary)} is missing; agents won't see your preferences`, `${run('init')} writes it.`);
  }

  const info = detectProject(dir);
  const allPkgRules = readAllPackageRules(dir);
  const totalPackageRules = Object.values(allPkgRules).reduce((sum, rules) => sum + rules.length, 0);
  const packagesWithRules: WorkspacePackage[] = info.packages.map(p => {
    const rules = readPackageRules(dir, p);
    return rules.length ? { ...p, rules } : p;
  });
  const isInside = location?.isInside ?? false;
  const subPath = location?.subPath ?? '';
  const activePackage = isInside && subPath
    ? packagesWithRules
        .filter(p => p.path === subPath || subPath.startsWith(p.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0] ?? null
    : null;

  for (const id of projectAgents(dir)) agentCheck(id, dir, info, add);
  const skills = await skillChecks(dir, registry, add);

  const decisionsDir = path.join(root, MEMORY_FILES.decisions);
  const badDecisions = markdownFiles(decisionsDir)
    .map(f => ({ f, r: parseDecision(fs.readFileSync(path.join(decisionsDir, f), 'utf8')) }))
    .filter(x => !x.r.ok);
  const decisionCount = markdownFiles(decisionsDir).length;
  if (badDecisions.length) {
    for (const { f, r } of badDecisions) {
      add('warn', 'Decision record', `${memoryPath(`${MEMORY_FILES.decisions}/${f}`)}: ${r.ok ? '' : r.error}`, `Match the template in ${memoryPath(`${MEMORY_FILES.decisions}/README.md`)}.`);
    }
  } else {
    add('ok', 'Decision records', `${decisionCount} readable`);
  }

  const proposedDir = path.join(root, MEMORY_FILES.proposedMemory);
  const proposals = markdownFiles(proposedDir);
  for (const f of proposals) {
    const r = parseProposal(fs.readFileSync(path.join(proposedDir, f), 'utf8'));
    if (!r.ok) add('warn', 'Proposed memory', `${memoryPath(`${MEMORY_FILES.proposedMemory}/${f}`)}: ${r.error}`, `Match the template in ${memoryPath(`${MEMORY_FILES.proposedMemory}/README.md`)}.`);
  }
  if (proposals.length) {
    add('info', 'Proposed memory', `${proposals.length} waiting for review in ${memoryPath(`${MEMORY_FILES.proposedMemory}/`)}`, 'Move each into the file it names, or delete it.');
  }

  const goal = readProjectGoal(dir);
  if (!goal) add('warn', 'Project goal', 'not written yet', `Write one or two sentences under "${PROJECT_GOAL_HEADING.slice(3)}" in ${memoryPath(MEMORY_FILES.context)}.`);
  const projectRules = readProjectRules(dir).length;
  for (const conflict of detectProjectRuleConflicts(dir, globalBrainDir)) {
    add('warn', 'Rule conflict', conflict.summary, conflict.fix);
  }

  const map = mapFreshness(dir);
  if (map.status === 'missing') {
    const detail = hasCodeFiles(dir) ? 'not built (optional)' : 'pending (waiting for source files)';
    const fix = hasCodeFiles(dir) ? `${run('map')} explains how to set it up.` : 'add source files (.ts, .js, .py) to build a code map.';
    add('info', 'Code map', detail, fix);
  }
  else if (map.status === 'stale') add('warn', 'Code map', `out of date: ${map.changedFiles} code file${map.changedFiles === 1 ? '' : 's'} changed since it was built (${map.sample.join(', ')}${map.changedFiles > map.sample.length ? ', ...' : ''})`, `${run('map --update')} refreshes it.`);
  else if (map.status === 'unknown') add('info', 'Code map', `can't tell if it is current: ${map.reason}`);
  else add('ok', 'Code map', `current${map.builtAtCommit ? ` (built at ${map.builtAtCommit.slice(0, 7)})` : ''}`);

  const taskFile = path.join(root, MEMORY_FILES.activeTask);
  let activeTask: ActiveTaskHeader | null = null;
  if (fs.existsSync(taskFile)) {
    const task = parseActiveTaskHeader(fs.readFileSync(taskFile, 'utf8'));
    if (!task.ok) add('warn', 'Active task', `${memoryPath(MEMORY_FILES.activeTask)}: ${task.error}`, 'Fix its header, or delete the file if the task is finished.');
    else if (task.value.status !== 'active') add('warn', 'Active task', `${memoryPath(MEMORY_FILES.activeTask)} has status "${task.value.status}", so agents ignore it`, 'Delete or archive it.');
    else activeTask = task.value;
  }

  const rootTarget = findSupportedRootFile(dir);
  if (rootTarget) {
    const content = stripBom(fs.readFileSync(rootTarget.file, 'utf8'));
    if (!LOADER_INSTALLED.test(content)) {
      add('warn', 'Dev toolbar', 'Dev toolbar not added.', 'luci toolbar');
    } else {
      const port = Number(/127\.0\.0\.1:(\d+)\/toolbar\.js/.exec(content)?.[1] ?? 4545);
      const health = await isServeListening(port);
      const fixCmd = port === 4545 ? 'run luci serve in this project.' : `run luci serve --port ${port} in this project.`;
      if (!health.ok) {
        add('warn', 'luci serve', `luci serve isn't running on port ${port}.`, fixCmd);
      } else if (health.project && !samePath(health.project, dir)) {
        add('warn', 'luci serve', `another project is running on port ${port} (${health.project}).`, fixCmd);
      } else {
        add('ok', 'Dev toolbar', `in ${rootTarget.rel} (port ${port})`);
      }
    }
  }

  return {
    checks,
    project: {
      name: info.projectName,
      framework: info.framework,
      goal,
      projectRules,
      packageRules: totalPackageRules,
      activePackage,
      packages: packagesWithRules.length ? packagesWithRules : undefined,
      activeTask,
      pendingProposals: proposals.length,
      skills,
      hasCodeMap: info.hasGraphify
    }
  };
}

function agentCheck(
  id: AgentId,
  dir: string,
  info: ReturnType<typeof detectProject>,
  add: (status: CheckStatus, label: string, detail?: string, fix?: string) => void
): void {
  const result = configureAgent(id, dir, info, { dryRun: true });
  const file = path.relative(dir, result.target).replace(/\\/g, '/');
  if (result.action === 'unchanged') add('ok', file, `${PRODUCT.name} section up to date`);
  else if (result.action === 'updated') add('warn', file, `${PRODUCT.name} section is out of date`, `${run('update')} refreshes it; the rest of the file is kept.`);
  // Claude Code and Cursor are always expected; another agent's own file without the section is a warning
  else add(DEFAULT_AGENTS.includes(id) ? 'fail' : 'warn', file, result.action === 'created' ? 'missing' : `no ${PRODUCT.name} section`, `${run('init')} adds it; the rest of the file is kept.`);
}

export async function diagnose(projectDir: string = process.cwd(), options: DiagnoseOptions = {}): Promise<Diagnosis> {
  const { root: dir, subPath, isInside } = findProjectRoot(projectDir);
  const globalBrainDir = options.globalBrainDir ?? userBrainDir();
  const project = await projectChecks(dir, options.registry ?? new SkillRegistry({ user: true }), globalBrainDir, { subPath, isInside });
  const checks = [...installChecks(options), ...project.checks];
  return { checks, project: project.project, ok: !checks.some(c => c.status === 'fail') };
}
