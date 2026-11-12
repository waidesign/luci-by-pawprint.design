import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT, decisionFileName, formatDecision } from '@luci/format';
import { memoryDir } from '../layout/brainLayout.js';
import { DEFAULT_BRAIN_DIR, userBrainDir } from './paths.js';

export const DECISION_HISTORY_FILE = 'decision-history.md';

const USER_BRAIN_README = `# Global Brain

Your preferences and decisions, shared by every project on this machine. ${PRODUCT.name} reads these files and never overwrites one you have. Edit them freely.

Set \`${PRODUCT.homeEnv}\` to move this folder, for example into a synced folder, to use one Global Brain on several machines.
`;
const DECISION_HISTORY_HEADER = '# Global Decision History\n\nYour confirmed cross-project decisions are logged here, one row each.\n\n| Timestamp | Category | Decision | Context |\n|---|---|---|---|\n';

export interface MemoryEngineOptions {
  /** The user's Global Brain. Defaults to ~/.luci/brain (or LUCI_HOME/brain). */
  globalBrainDir?: string;
  /** Default files copied into a new Global Brain. */
  defaultsDir?: string;
}

export interface DecisionInput {
  category: string;
  decision: string;
  context: string;
}

const today = () => new Date().toISOString().slice(0, 10);
/** One table cell: no pipes, no line breaks. */
const cell = (text: string) => text.replace(/\|/g, '-').replace(/\s*\r?\n\s*/g, ' ').trim();

/**
 * Global memory (the user's Global Brain) and the decision records of a project.
 * The Global Brain is always the user's own folder, never the installed package:
 * updates must not overwrite user memory, and personal decisions must not end up in Luci's repository.
 */
export class MemoryEngine {
  readonly globalBrainDir: string;
  readonly defaultsDir: string;

  constructor(options: MemoryEngineOptions = {}) {
    this.globalBrainDir = options.globalBrainDir ?? userBrainDir();
    this.defaultsDir = options.defaultsDir ?? DEFAULT_BRAIN_DIR;
  }

  /**
   * Create the Global Brain if needed: copy Luci's default files into it, then add a
   * README and an empty decision history. Never overwrites a file the user already has.
   */
  initGlobalBrain(): void {
    fs.mkdirSync(this.globalBrainDir, { recursive: true });
    const writeIfMissing = (file: string, content: string) => {
      const target = path.join(this.globalBrainDir, file);
      if (!fs.existsSync(target)) fs.writeFileSync(target, content, 'utf8');
    };

    if (path.resolve(this.defaultsDir) !== path.resolve(this.globalBrainDir) && fs.existsSync(this.defaultsDir)) {
      for (const file of fs.readdirSync(this.defaultsDir)) {
        // The defaults README describes the defaults folder; the user's brain gets its own
        if (!file.endsWith('.md') || file === 'README.md') continue;
        const target = path.join(this.globalBrainDir, file);
        if (!fs.existsSync(target)) fs.copyFileSync(path.join(this.defaultsDir, file), target);
      }
    }
    writeIfMissing('README.md', USER_BRAIN_README);
    writeIfMissing(DECISION_HISTORY_FILE, DECISION_HISTORY_HEADER);
  }

  /** Every Markdown file in the Global Brain, by file name. */
  getGlobalBrain(): Record<string, string> {
    this.initGlobalBrain();
    const result: Record<string, string> = {};
    for (const entry of fs.readdirSync(this.globalBrainDir).sort()) {
      if (entry.endsWith('.md')) result[entry] = fs.readFileSync(path.join(this.globalBrainDir, entry), 'utf8');
    }
    return result;
  }

  /** The Markdown files at the top of a project's .luci/, or null when it has none. */
  getProjectBrain(projectDir: string): { files: Record<string, string> } | null {
    const dir = memoryDir(projectDir);
    if (!fs.existsSync(dir)) return null;
    const files: Record<string, string> = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) files[entry.name] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    }
    return { files };
  }

  /**
   * Write a decision record into the project's .luci/decisions/. Returns its path relative
   * to the project. Throws when the project has no memory folder, so a decision is never lost silently.
   */
  recordProjectDecision(projectDir: string, input: DecisionInput): string {
    const decisionsDir = path.join(memoryDir(projectDir), MEMORY_FILES.decisions);
    if (!fs.existsSync(decisionsDir)) {
      throw new Error(`No ${PRODUCT.projectDir}/${MEMORY_FILES.decisions}/ in ${projectDir}. Run \`${PRODUCT.command} init\` there first.`);
    }
    const record = {
      title: cell(input.decision),
      date: today(),
      status: 'accepted',
      area: cell(input.category),
      what: input.decision.trim(),
      why: input.context.trim(),
      alternatives: ''
    };
    const base = decisionFileName(record).replace(/\.md$/, '');
    let file = path.join(decisionsDir, `${base}.md`);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(decisionsDir, `${base}-${n}.md`);
    fs.writeFileSync(file, formatDecision(record), 'utf8');
    return path.relative(projectDir, file).replace(/\\/g, '/');
  }

  /** Add a row to the Global Brain's decision history. Returns the file written. */
  recordGlobalDecision(input: DecisionInput): string {
    this.initGlobalBrain();
    const file = path.join(this.globalBrainDir, DECISION_HISTORY_FILE);
    const existing = fs.readFileSync(file, 'utf8');
    const prefix = existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(file, `${prefix}| ${today()} | ${cell(input.category)} | ${cell(input.decision)} | ${cell(input.context)} |\n`, 'utf8');
    return file;
  }
}
