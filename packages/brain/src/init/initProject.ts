import path from 'node:path';
import { detectProject, type ProjectInfo } from '../detect/detector.js';
import { writeBrain } from '../layout/writeBrain.js';

export interface InitOptions {
  dryRun?: boolean;
  /** Overwrite template files that already exist. */
  force?: boolean;
  /** Luci's version, recorded in brain.json. */
  version?: string;
}

export interface InitReport {
  projectPath: string;
  dryRun: boolean;
  projectInfo: ProjectInfo;
  /** Project-relative paths written (or, in a dry run, that would be). */
  created: string[];
  /** Files kept because they exist, and steps left out. */
  skipped: string[];
  warnings: string[];
}

/**
 * Set up a project: detect the stack and create .luci/. Running it again keeps
 * every file someone may have edited and refreshes only brain.json.
 */
export function initProject(targetDir: string = process.cwd(), options: InitOptions = {}): InitReport {
  const dir = path.resolve(targetDir);
  const dryRun = Boolean(options.dryRun);
  const projectInfo = detectProject(dir);

  const brain = writeBrain(dir, projectInfo, {
    dryRun,
    force: Boolean(options.force),
    ...(options.version ? { version: options.version } : {})
  });

  return {
    projectPath: dir,
    dryRun,
    projectInfo,
    created: [...brain.created],
    skipped: [...brain.skipped],
    warnings: []
  };
}
