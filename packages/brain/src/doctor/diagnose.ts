/**
 * Checks behind `luci doctor` (B5): the install, the user's Global Brain and the
 * current project's memory folder. Every problem comes with the fix. Reads only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MEMORY_FILES,
  PRODUCT,
  PROJECT_GOAL_HEADING,
  PROJECT_RULES_HEADING,
  TEMPLATE_DIRS,
  TEMPLATE_FILES,
  parseActiveTaskHeader,
  parseDecision,
  parseProposal,
  sectionBody,
  type ActiveTaskHeader,
  type AgentId
} from '@luci/format';
import { AGENT_IDS, configureAgent } from '../agents/agentFiles.js';
import { detectProject } from '../detect/detector.js';
import { TEMPLATES_DIR, memoryDir, memoryPath, readBrainJson } from '../layout/brainLayout.js';
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
  activeTask: ActiveTaskHeader | null;
  pendingProposals: number;
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
}

const MIN_NODE_MAJOR = 18;
const GOAL_PLACEHOLDER = '_Not written yet';
const run = (args: string) => `\`${PRODUCT.command} ${args}\``;
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
  return checks;
}

function projectChecks(dir: string): { checks: Check[]; project: ProjectSummary | null } {
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
  for (const id of AGENT_IDS) agentCheck(id, dir, info, add);

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

  const contextFile = path.join(root, MEMORY_FILES.context);
  const goalText = fs.existsSync(contextFile) ? sectionBody(fs.readFileSync(contextFile, 'utf8'), PROJECT_GOAL_HEADING) : '';
  const goal = goalText && !goalText.startsWith(GOAL_PLACEHOLDER) ? goalText : null;
  if (!goal) add('warn', 'Project goal', 'not written yet', `Write one or two sentences under "${PROJECT_GOAL_HEADING.slice(3)}" in ${memoryPath(MEMORY_FILES.context)}.`);

  const rulesFile = path.join(root, MEMORY_FILES.rules);
  const projectRules = fs.existsSync(rulesFile)
    ? sectionBody(fs.readFileSync(rulesFile, 'utf8'), PROJECT_RULES_HEADING).split('\n').filter(l => /^\s*-\s+/.test(l)).length
    : 0;

  const taskFile = path.join(root, MEMORY_FILES.activeTask);
  let activeTask: ActiveTaskHeader | null = null;
  if (fs.existsSync(taskFile)) {
    const task = parseActiveTaskHeader(fs.readFileSync(taskFile, 'utf8'));
    if (!task.ok) add('warn', 'Active task', `${memoryPath(MEMORY_FILES.activeTask)}: ${task.error}`, 'Fix its header, or delete the file if the task is finished.');
    else if (task.value.status !== 'active') add('warn', 'Active task', `${memoryPath(MEMORY_FILES.activeTask)} has status "${task.value.status}", so agents ignore it`, 'Delete or archive it.');
    else activeTask = task.value;
  }

  return {
    checks,
    project: {
      name: info.projectName,
      framework: info.framework,
      goal,
      projectRules,
      activeTask,
      pendingProposals: proposals.length,
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
  else if (result.action === 'updated') add('warn', file, `${PRODUCT.name} section is out of date`, `${run('init')} refreshes it; the rest of the file is kept.`);
  else add('fail', file, result.action === 'created' ? 'missing' : `no ${PRODUCT.name} section`, `${run('init')} adds it; the rest of the file is kept.`);
}

export function diagnose(projectDir: string = process.cwd(), options: DiagnoseOptions = {}): Diagnosis {
  const dir = path.resolve(projectDir);
  const project = projectChecks(dir);
  const checks = [...installChecks(options), ...project.checks];
  return { checks, project: project.project, ok: !checks.some(c => c.status === 'fail') };
}
