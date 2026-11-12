import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, SKILL_FILE, TEMPLATE_DIRS, TEMPLATE_FILES, formatBrainJson } from '@luci/format';
import type { ProjectInfo } from '../detect/detector.js';
import {
  TEMPLATES_DIR,
  buildBrainJson,
  ensureLocalDir,
  memoryDir,
  memoryPath,
  projectFacts,
  readBrainJsonObject,
  renderTemplateFile
} from './brainLayout.js';

export interface WriteBrainOptions {
  /** Overwrite template files that already exist. */
  force?: boolean;
  /** Report what would be written, write nothing. */
  dryRun?: boolean;
  /** Luci's version, recorded in brain.json. */
  version?: string;
  templatesDir?: string;
  /** Copy the starter project skills (default true). */
  starterSkills?: boolean;
}

/** Paths relative to the project, such as ".luci/rules.md". */
export interface WriteReport {
  created: string[];
  skipped: string[];
}

/**
 * Write the project memory folder: template files, folder READMEs, brain.json and local/.
 * Existing files are kept unless `force`; brain.json is always refreshed.
 */
export function writeBrain(dir: string, info: ProjectInfo, options: WriteBrainOptions = {}): WriteReport {
  const { force = false, dryRun = false, version = '' } = options;
  const root = memoryDir(dir);
  const facts = projectFacts(info, dir);
  const report: WriteReport = { created: [], skipped: [] };
  const templateOptions = options.templatesDir ? { templatesDir: options.templatesDir } : {};

  const put = (rel: string, content: string) => {
    const target = path.join(root, rel);
    if (fs.existsSync(target) && !force) {
      report.skipped.push(`${memoryPath(rel)} (exists)`);
      return;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    report.created.push(memoryPath(rel));
  };

  for (const file of TEMPLATE_FILES) put(file, renderTemplateFile(file, facts, templateOptions) ?? `# ${file}\n`);
  for (const sub of TEMPLATE_DIRS) {
    const readme = `${sub}/README.md`;
    put(readme, renderTemplateFile(readme, facts, templateOptions) ?? `# ${sub}\n`);
  }

  // brain.json is Luci's own record: refreshed every time, keeping keys someone added
  const existing = readBrainJsonObject(dir);
  if (!dryRun) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, MEMORY_FILES.brain), formatBrainJson(buildBrainJson(facts, existing ?? {}, version)), 'utf8');
  }
  if (!existing) report.created.push(memoryPath(MEMORY_FILES.brain));

  const gitignore = `${MEMORY_FILES.local}/.gitignore`;
  if (!fs.existsSync(path.join(root, gitignore))) report.created.push(memoryPath(gitignore));
  if (!dryRun) ensureLocalDir(dir);

  // Starter project skills (Luci Skill Standard folders): short, committed with the project
  const starterDir = path.join(options.templatesDir ?? TEMPLATES_DIR, MEMORY_FILES.skills);
  const starters = options.starterSkills !== false && fs.existsSync(starterDir)
    ? fs.readdirSync(starterDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    : [];
  for (const name of starters) {
    const rel = `${MEMORY_FILES.skills}/${name}/`;
    const target = path.join(root, MEMORY_FILES.skills, name);
    if (fs.existsSync(path.join(target, SKILL_FILE)) && !force) {
      report.skipped.push(`${memoryPath(rel)} (exists)`);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(target, { recursive: true });
      for (const file of fs.readdirSync(path.join(starterDir, name))) fs.copyFileSync(path.join(starterDir, name, file), path.join(target, file));
    }
    report.created.push(memoryPath(rel));
  }

  return report;
}
