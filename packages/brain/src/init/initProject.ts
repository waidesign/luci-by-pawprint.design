import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, type AgentId } from '@luci/format';
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
}

export interface InitReport {
  projectPath: string;
  dryRun: boolean;
  projectInfo: ProjectInfo;
  globalBrainDir: string;
  /** What happened to each agent's instruction file. */
  agents: Record<AgentId, AgentFileResult>;
  /** Project-relative paths written for the first time (or, in a dry run, that would be). */
  created: string[];
  /** Generated files rewritten with current content. */
  updated: string[];
  /** Files kept because they exist, and steps left out. */
  skipped: string[];
  warnings: string[];
}

/**
 * Set up a project: detect the stack, make sure the user's Global Brain exists,
 * create .luci/, write the Global Brain summary and each agent's instruction file.
 * Running it again keeps every file someone may have edited and refreshes only
 * generated files and the Luci section of agent files.
 */
export function initProject(targetDir: string = process.cwd(), options: InitOptions = {}): InitReport {
  const dir = path.resolve(targetDir);
  const dryRun = Boolean(options.dryRun);
  const projectInfo = detectProject(dir);
  const memory = new MemoryEngine(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {});
  const report: InitReport = {
    projectPath: dir,
    dryRun,
    projectInfo,
    globalBrainDir: memory.globalBrainDir,
    agents: {} as Record<AgentId, AgentFileResult>,
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

  // A read-only summary of the user's preferences, for agents that can't read ~/.luci
  const summary = memoryPath(MEMORY_FILES.globalBrainSummary);
  const hadSummary = fs.existsSync(path.join(memoryDir(dir), MEMORY_FILES.globalBrainSummary));
  if (!dryRun) writeGlobalBrainSnapshot(dir, memory.globalBrainDir);
  (hadSummary ? report.updated : report.created).push(summary);

  // Agent instruction files: only the Luci section is written; the rest of each file is the project's
  report.agents = configureAgents(dir, projectInfo, { dryRun });
  for (const result of Object.values(report.agents)) {
    const rel = path.relative(dir, result.target).replace(/\\/g, '/');
    if (result.action === 'created') report.created.push(rel);
    else if (result.action === 'unchanged') report.skipped.push(`${rel} (up to date)`);
    else report.updated.push(`${rel} (${result.action === 'merged' ? 'Luci section added' : 'Luci section refreshed'})`);
  }

  return report;
}
