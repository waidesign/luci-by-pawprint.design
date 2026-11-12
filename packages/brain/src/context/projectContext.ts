/**
 * Everything Luci knows about a project, validated, in one object. Used by the MCP server
 * (get_project_context) and by `luci start`. Reads only: nothing is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MEMORY_FILES,
  PRECEDENCE,
  PRODUCT,
  PROJECT_GOAL_HEADING,
  PROJECT_RULES_HEADING,
  sectionBody,
  type ProjectCommands
} from '@luci/format';
import { SkillRegistry, addedPacks, missingSkillWarnings, projectSkillSet, readLock, trustLevel, type Skill, type SkillSource, type TrustLevel } from '@luci/skills';
import { GRAPH_JSON, detectProject } from '../detect/detector.js';
import { suggestPacks, type PackSuggestion } from '../init/initProject.js';
import { memoryDir, memoryPath, readBrainJson } from '../layout/brainLayout.js';
import { readActiveTask, type ActiveTask } from '../memory/activeTask.js';
import { GLOBAL_PREFERENCE_FILES } from '../memory/globalLink.js';
import { userBrainDir } from '../memory/paths.js';

export const CONTEXT_VERSION = 1;
const GOAL_PLACEHOLDER = '_Not written yet';
const GRAPH_REPORT = path.join('graphify-out', 'GRAPH_REPORT.md');

/** The goal written under "## Project Goal" in context.md, or null while it is the placeholder. */
export function readProjectGoal(projectDir: string): string | null {
  const file = path.join(memoryDir(projectDir), MEMORY_FILES.context);
  if (!fs.existsSync(file)) return null;
  const goal = sectionBody(fs.readFileSync(file, 'utf8'), PROJECT_GOAL_HEADING);
  return goal && !goal.startsWith(GOAL_PLACEHOLDER) ? goal : null;
}

/** The bullet items under "## Project-Specific Rules" in rules.md. */
export function readProjectRules(projectDir: string): string[] {
  const file = path.join(memoryDir(projectDir), MEMORY_FILES.rules);
  if (!fs.existsSync(file)) return [];
  return sectionBody(fs.readFileSync(file, 'utf8'), PROJECT_RULES_HEADING)
    .split('\n')
    .filter(l => /^\s*-\s+/.test(l))
    .map(l => l.replace(/^\s*-\s+/, '').trim());
}

export interface ContextSkill {
  id: string;
  name: string;
  summary: string;
  /** Why the project selected it (library skills only). */
  reason: string | null;
  version: string | null;
  tokens: number | null;
  trust: TrustLevel;
  permissions: string[];
  /** The skill file to open when a task needs it. */
  path: string | null;
}

export interface ProjectContext {
  version: number;
  project: { name: string; path: string; framework: string; languages: string[]; packageManager: string; uiLibraries: string[] };
  initialized: boolean;
  layout: number | null;
  goal: string | null;
  /** The project's own rules (the Project-Specific Rules section). */
  rules: string[];
  commands: ProjectCommands;
  precedence: readonly string[];
  /** Project-relative paths of the memory files that exist. */
  files: Record<string, string | null>;
  /** The current task, only while its status is active. */
  activeTask: ActiveTask | null;
  skills: { selected: ContextSkill[]; project: ContextSkill[] };
  packs: { added: string[]; suggested: PackSuggestion[] };
  graph: { available: true; json: string; report: string | null } | { available: false };
  globalBrain: string;
  warnings: string[];
}

export interface ProjectContextOptions {
  registry?: SkillSource;
  globalBrainDir?: string;
}

const run = (args: string) => `\`${PRODUCT.command} ${args}\``;

function describe(projectDir: string, s: Skill): ContextSkill {
  return {
    id: s.id,
    name: s.name,
    summary: s.contract?.summary || s.description,
    reason: s.selection?.reason ?? null,
    version: s.selection?.version ?? s.version ?? null,
    tokens: s.tokenEstimate ?? null,
    trust: trustLevel(s),
    permissions: [...(s.contract?.permissions ?? [])],
    path: s.filePath ? path.relative(projectDir, s.filePath).replace(/\\/g, '/') : null
  };
}

export async function loadProjectContext(projectDir: string = process.cwd(), options: ProjectContextOptions = {}): Promise<ProjectContext> {
  const dir = path.resolve(projectDir);
  const registry = options.registry ?? new SkillRegistry({ user: true });
  const info = detectProject(dir);
  const root = memoryDir(dir);
  const initialized = fs.existsSync(root);
  const warnings: string[] = [];
  const existing = (rel: string) => (fs.existsSync(path.join(root, rel)) ? memoryPath(rel) : null);

  if (!initialized) warnings.push(`No ${PRODUCT.projectDir}/ folder: run ${run('init')} in this project.`);

  const lock = readLock(dir);
  if (lock.invalid) warnings.push(`${memoryPath(MEMORY_FILES.skillsLock)} is not valid JSON; no library skills are selected until it is fixed.`);
  const set = initialized ? await projectSkillSet(dir, registry) : { selected: [], own: [], missing: [] };
  warnings.push(...missingSkillWarnings(lock, set.missing));

  const overrides = initialized ? GLOBAL_PREFERENCE_FILES.filter(f => fs.existsSync(path.join(root, f))) : [];
  if (overrides.length) {
    warnings.push(`These project files shadow your Global Brain: ${overrides.map(memoryPath).join(', ')}. Global preferences belong in ~/${PRODUCT.homeDir}/brain.`);
  }

  const brain = initialized ? readBrainJson(dir) : null;
  if (initialized && !brain) warnings.push(`${memoryPath(MEMORY_FILES.brain)} is missing. Run ${run('update')} to restore it.`);
  else if (brain && !brain.ok) warnings.push(`${memoryPath(MEMORY_FILES.brain)}: ${brain.error}`);
  const brainJson = brain?.ok ? brain.value : null;

  // The current task counts only while active; a finished or stale one must not steer agents
  const task = initialized ? readActiveTask(dir) : null;
  const activeTask = task && task.status === 'active' ? task : null;
  if (task && task.status !== 'active') warnings.push(`${task.file} has status "${task.status}", so it is ignored. Run ${run('task done')} to archive it.`);

  const goal = initialized ? readProjectGoal(dir) : null;
  const graphJson = path.join(dir, GRAPH_JSON);

  return {
    version: CONTEXT_VERSION,
    project: {
      name: info.projectName,
      path: dir,
      framework: info.framework,
      languages: info.languages,
      packageManager: info.packageManager,
      uiLibraries: info.uiLibraries
    },
    initialized,
    layout: brainJson?.layout ?? null,
    goal,
    rules: initialized ? readProjectRules(dir) : [],
    commands: brainJson?.project.commands ?? info.commands,
    precedence: brainJson?.precedence ?? PRECEDENCE,
    files: {
      brain: existing(MEMORY_FILES.brain),
      context: existing(MEMORY_FILES.context),
      rules: existing(MEMORY_FILES.rules),
      playbook: existing(MEMORY_FILES.playbook),
      skillCatalog: existing(MEMORY_FILES.skillCatalog),
      decisions: existing(MEMORY_FILES.decisions),
      proposedMemory: existing(MEMORY_FILES.proposedMemory),
      globalBrainSummary: existing(MEMORY_FILES.globalBrainSummary)
    },
    activeTask,
    skills: { selected: set.selected.map(s => describe(dir, s)), project: set.own.map(s => describe(dir, s)) },
    packs: initialized
      ? { added: addedPacks(dir), suggested: await suggestPacks(dir, info, registry, goal ?? '') }
      : { added: [], suggested: [] },
    graph: fs.existsSync(graphJson)
      ? { available: true, json: GRAPH_JSON.replace(/\\/g, '/'), report: fs.existsSync(path.join(dir, GRAPH_REPORT)) ? GRAPH_REPORT.replace(/\\/g, '/') : null }
      : { available: false },
    globalBrain: options.globalBrainDir ?? userBrainDir(),
    warnings
  };
}
