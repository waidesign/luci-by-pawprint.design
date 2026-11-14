import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, refreshSections } from '@luci/format';
import { SkillRegistry, writeCatalog, type SkillSource } from '@luci/skills';
import { configureAgents } from '../agents/agentFiles.js';
import { cleanPrototypeSections } from '../import/importPrototype.js';
import { CodeMap, mapFreshness } from '../codemap/codeMap.js';
import { detectProject } from '../detect/detector.js';
import { diagnose, type Diagnosis } from '../doctor/diagnose.js';
import { autoSections, memoryDir, memoryPath, projectFacts } from '../layout/brainLayout.js';
import { writeBrain } from '../layout/writeBrain.js';
import { writeGlobalBrainSnapshot } from '../memory/globalLink.js';
import { MemoryEngine } from '../memory/memoryEngine.js';

export interface StartReport {
  projectPath: string;
  initialized: boolean;
  /** The doctor's view: checks and the context agents get. */
  diagnosis: Diagnosis | null;
}

/**
 * Resume a project (B3): refresh the Global Brain summary so agents see the user's latest
 * preferences, then report the context an agent needs to continue (active task, goal,
 * rules, skills) and any problems.
 */
export async function startProject(targetDir: string = process.cwd(), options: { globalBrainDir?: string; registry?: SkillSource } = {}): Promise<StartReport> {
  const dir = path.resolve(targetDir);
  if (!fs.existsSync(memoryDir(dir))) return { projectPath: dir, initialized: false, diagnosis: null };
  const memory = new MemoryEngine(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {});
  memory.initGlobalBrain();
  writeGlobalBrainSnapshot(dir, memory.globalBrainDir);
  const diagnosis = await diagnose(dir, {
    ...(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {}),
    ...(options.registry ? { registry: options.registry } : {})
  });
  return { projectPath: dir, initialized: true, diagnosis };
}

export interface UpdateReport {
  projectPath: string;
  initialized: boolean;
  /** Memory files that were missing and were added. */
  added: string[];
  /** "(auto-detected)" sections rewritten, e.g. "context.md Commands". */
  refreshedSections: string[];
  /** Agent files whose Luci section was added or refreshed. */
  agentFiles: string[];
  /** Agent files whose leftover pre-import section (pointing to the old memory folder) was removed. */
  oldSectionsRemoved: string[];
  /** What happened to an existing code map: refreshed when out of date and Graphify is installed. */
  codeMap: string | null;
}

/**
 * Refresh a project after changes (B4): add missing memory files (existing ones are kept),
 * rewrite the "(auto-detected)" sections of context.md, brain.json, the Luci section of
 * agent files, the skill catalog and the Global Brain summary. Text people wrote is never touched.
 */
export async function updateProject(
  targetDir: string = process.cwd(),
  options: { globalBrainDir?: string; registry?: SkillSource; version?: string; codeMap?: CodeMap } = {}
): Promise<UpdateReport> {
  const dir = path.resolve(targetDir);
  const report: UpdateReport = { projectPath: dir, initialized: fs.existsSync(memoryDir(dir)), added: [], refreshedSections: [], agentFiles: [], oldSectionsRemoved: [], codeMap: null };
  if (!report.initialized) return report;

  const info = detectProject(dir);
  const brain = writeBrain(dir, info, { starterSkills: false, ...(options.version ? { version: options.version } : {}) });
  report.added.push(...brain.created.filter(f => !f.endsWith(MEMORY_FILES.brain)));

  const contextFile = path.join(memoryDir(dir), MEMORY_FILES.context);
  if (fs.existsSync(contextFile)) {
    const { content, changed } = refreshSections(fs.readFileSync(contextFile, 'utf8'), autoSections(projectFacts(info, dir)));
    if (changed.length) {
      fs.writeFileSync(contextFile, content, 'utf8');
      report.refreshedSections.push(...changed.map(h => `${MEMORY_FILES.context} ${h.replace(/^## /, '').replace(/ \(auto-detected\)$/, '')}`));
    }
  }

  const memory = new MemoryEngine(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {});
  memory.initGlobalBrain();
  writeGlobalBrainSnapshot(dir, memory.globalBrainDir);
  await writeCatalog(dir, options.registry ?? new SkillRegistry({ user: true }));

  for (const result of Object.values(configureAgents(dir, info))) {
    if (result && result.action !== 'unchanged') report.agentFiles.push(path.relative(dir, result.target).replace(/\\/g, '/'));
  }
  // An old section from before the import (in a file it missed), next to Luci's: it points to a folder that is gone
  report.oldSectionsRemoved = cleanPrototypeSections(dir);

  // The code map is refreshed only when one exists and is out of date; update never builds a new one
  const map = mapFreshness(dir);
  if (map.status === 'stale') {
    try {
      report.codeMap = (await (options.codeMap ?? new CodeMap({ projectRoot: dir })).generate({ targetDir: dir, force: true })).summary;
    } catch (err) {
      report.codeMap = `Could not refresh the code map: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else if (map.status === 'fresh') {
    report.codeMap = 'The code map is current.';
  }
  return report;
}

export const generatedFiles = () => [memoryPath(MEMORY_FILES.brain), memoryPath(MEMORY_FILES.skillCatalog), memoryPath(MEMORY_FILES.globalBrainSummary)];
