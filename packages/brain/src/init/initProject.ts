import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, type AgentId } from '@luci/format';
import { SkillRegistry, addedPacks, detectPacks, loadPacks, packSkills, writeCatalog, type SkillSource } from '@luci/skills';
import { configureAgents } from '../agents/agentFiles.js';
import type { AgentFileResult } from '../agents/agentBlock.js';
import { detectProject, type ProjectInfo } from '../detect/detector.js';
import { memoryDir, memoryPath } from '../layout/brainLayout.js';
import { writeBrain } from '../layout/writeBrain.js';
import { writeGlobalBrainSnapshot } from '../memory/globalLink.js';
import { MemoryEngine } from '../memory/memoryEngine.js';

export interface InitOptions {
  /** Report what would be written; write nothing, not even the Global Brain. */
  dryRun?: boolean;
  /** Overwrite template files that already exist. */
  force?: boolean;
  /** Luci's version, recorded in brain.json. */
  version?: string;
  /** The user's Global Brain. Defaults to ~/.luci/brain (or LUCI_HOME/brain). */
  globalBrainDir?: string;
  /** The skill library (default: Luci's library plus the user's personal one). */
  registry?: SkillSource;
  /** Agents to write files for besides Claude Code, Cursor and those the project has a file for. */
  agents?: readonly AgentId[];
}

export interface PackSuggestion {
  name: string;
  title: string;
  description: string;
  reasons: string[];
  skills: string[];
}

export interface InitReport {
  projectPath: string;
  dryRun: boolean;
  projectInfo: ProjectInfo;
  globalBrainDir: string;
  /** What happened to each agent's instruction file. */
  agents: Partial<Record<AgentId, AgentFileResult>>;
  /** Skill packs that fit the project and aren't added yet. Nothing is added here. */
  packsSuggested: PackSuggestion[];
  /** Project-relative paths written for the first time (or, in a dry run, that would be). */
  created: string[];
  /** Generated files rewritten with current content. */
  updated: string[];
  /** Files kept because they exist, and steps left out. */
  skipped: string[];
  warnings: string[];
}

/** Packs that fit the project and aren't added yet, each with why and the skills it would add here. */
export async function suggestPacks(dir: string, info: ProjectInfo, registry: SkillSource, goal = ''): Promise<PackSuggestion[]> {
  const added = new Set(addedPacks(dir));
  const out: PackSuggestion[] = [];
  for (const { pack, reasons } of detectPacks(loadPacks(), info, { projectDir: dir, goal })) {
    if (added.has(pack.name)) continue;
    const { skills } = await packSkills(pack, info, registry);
    if (skills.length) out.push({ name: pack.name, title: pack.title, description: pack.description, reasons, skills: skills.map(s => s.id) });
  }
  return out;
}

/**
 * Set up a project: detect the stack, make sure the user's Global Brain exists, create
 * .luci/ (with the starter project skills), write the Global Brain summary, the skill
 * catalog and each agent's instruction file, and suggest skill packs. Running it again
 * keeps every file someone may have edited and refreshes only generated files and the
 * Luci section of agent files.
 */
export async function initProject(targetDir: string = process.cwd(), options: InitOptions = {}): Promise<InitReport> {
  const dir = path.resolve(targetDir);
  const dryRun = Boolean(options.dryRun);
  const projectInfo = detectProject(dir);
  const memory = new MemoryEngine(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {});
  const registry = options.registry ?? new SkillRegistry({ user: true });
  const report: InitReport = {
    projectPath: dir,
    dryRun,
    projectInfo,
    globalBrainDir: memory.globalBrainDir,
    agents: {},
    packsSuggested: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: []
  };

  if (!dryRun) memory.initGlobalBrain();

  const brain = writeBrain(dir, projectInfo, {
    dryRun,
    force: Boolean(options.force),
    ...(options.version ? { version: options.version } : {})
  });
  report.created.push(...brain.created);
  report.skipped.push(...brain.skipped);

  const generated = async (rel: string, write: () => unknown) => {
    const existed = fs.existsSync(path.join(memoryDir(dir), rel));
    if (!dryRun) await write();
    (existed ? report.updated : report.created).push(memoryPath(rel));
  };
  // A read-only summary of the user's preferences, for agents that can't read ~/.luci
  await generated(MEMORY_FILES.globalBrainSummary, () => writeGlobalBrainSnapshot(dir, memory.globalBrainDir));
  // The short list of project skills agents read instead of full skills
  await generated(MEMORY_FILES.skillCatalog, () => writeCatalog(dir, registry));

  // Agent instruction files: only the Luci section is written; the rest of each file is the project's
  report.agents = configureAgents(dir, projectInfo, { dryRun, ...(options.agents ? { agents: options.agents } : {}) });
  for (const result of Object.values(report.agents)) {
    if (!result) continue;
    const rel = path.relative(dir, result.target).replace(/\\/g, '/');
    if (result.action === 'created') report.created.push(rel);
    else if (result.action === 'unchanged') report.skipped.push(`${rel} (up to date)`);
    else report.updated.push(`${rel} (${result.action === 'merged' ? 'Luci section added' : 'Luci section refreshed'})`);
  }

  report.packsSuggested = await suggestPacks(dir, projectInfo, registry);
  return report;
}
