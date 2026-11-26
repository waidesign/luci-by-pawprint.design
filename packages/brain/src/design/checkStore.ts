/**
 * The latest design check runs (v0.4, automatic design check): the dev toolbar checks a built
 * component again whenever the page changes and sends each run here (through luci serve), so the
 * agent can read whether its changes made the component match the design (get_design_checks).
 * Kept in .luci/design/checks.json, the latest run of each check (design, selector, page), newest first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES } from '@luci-dev/format';
import { checkRunSchema, type CheckRun } from '@luci-dev/format/capture';
import { memoryDir } from '../layout/brainLayout.js';
import { writeAtomic } from '../feedback/feedbackStore.js';

export const CHECKS_FILE = 'checks.json';
/** Enough for every check a person keeps open; older ones fall off. */
export const MAX_CHECK_RUNS = 20;

const keyOf = (r: CheckRun) => `${r.design}\n${r.selector}\n${r.page}`;

export class CheckStore {
  readonly file: string;

  constructor(readonly projectDir: string) {
    this.file = path.join(memoryDir(projectDir), MEMORY_FILES.design, CHECKS_FILE);
  }

  get available(): boolean {
    return fs.existsSync(memoryDir(this.projectDir));
  }

  /** The latest run of each check, newest first. */
  list(): CheckRun[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown[];
      return raw.flatMap(r => { const p = checkRunSchema.safeParse(r); return p.success ? [p.data] : []; });
    } catch {
      return [];
    }
  }

  /** Keep a run: it replaces the earlier run of the same check. */
  save(run: CheckRun): void {
    const valid = checkRunSchema.parse(run);
    const runs = [valid, ...this.list().filter(r => keyOf(r) !== keyOf(valid))].slice(0, MAX_CHECK_RUNS);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, `${JSON.stringify(runs, null, 2)}\n`);
  }
}
