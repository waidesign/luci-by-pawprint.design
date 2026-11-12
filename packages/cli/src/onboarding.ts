import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { MEMORY_FILES, PRODUCT, PROJECT_GOAL_HEADING, PROJECT_RULES_HEADING, appendToSection, setSection } from '@luci/format';
import { memoryDir } from '@luci/brain';

const MAX_RULES = 20;

/** Save the project goal in .luci/context.md without touching anything the user wrote. */
function saveGoal(root: string, goal: string): void {
  const file = path.join(root, MEMORY_FILES.context);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Project Context\n';
  fs.writeFileSync(file, setSection(existing, PROJECT_GOAL_HEADING, goal), 'utf8');
}

/** Append the user's rules to .luci/rules.md, skipping ones already there. Returns how many were added. */
function saveRules(root: string, rules: readonly string[]): number {
  const file = path.join(root, MEMORY_FILES.rules);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Project Rules\n';
  const fresh = rules.filter(r => !existing.includes(`- ${r}`));
  if (fresh.length === 0) return 0;
  fs.writeFileSync(file, appendToSection(existing, PROJECT_RULES_HEADING, fresh.map(r => `- ${r}`)), 'utf8');
  return fresh.length;
}

export interface OnboardingOptions {
  projectDir: string;
  /** Returns the typed answer; pass a fake in tests. */
  ask: (question: string) => Promise<string>;
  log?: (line: string) => void;
}

export interface OnboardingResult {
  goal: string;
  rules: string[];
  written: string[];
}

/**
 * Short onboarding after `luci init`. Works for any kind of project:
 *   1. What are you building?                     -> .luci/context.md
 *   2. Rules your AI agents must always follow    -> .luci/rules.md
 * Skill and skill-pack suggestions join in M2, the code map in M3.
 */
export async function runOnboarding(options: OnboardingOptions): Promise<OnboardingResult> {
  const { projectDir, ask } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const root = memoryDir(projectDir);
  fs.mkdirSync(root, { recursive: true });
  const written: string[] = [];
  const steps = 2;
  const step = (n: number, title: string) => log(`\n[${n}/${steps}] ${title}`);

  log('\nProject onboarding (press Enter to skip any question)');

  step(1, 'What are you building?');
  log('    One line is enough, e.g. "REST API for a booking app" or "Marketing site for a bakery".');
  const goal = (await ask('    > ')).trim();
  if (goal) {
    saveGoal(root, goal);
    written.push(`${PRODUCT.projectDir}/${MEMORY_FILES.context} (project goal)`);
    log('    Saved as the project goal.');
  } else {
    log('    Skipped.');
  }

  step(2, 'Any rules your AI agents must always follow?');
  log('    e.g. "All API endpoints require auth", "Follow MISRA C", "Support Safari 15+".');
  const rules: string[] = [];
  while (rules.length < MAX_RULES) {
    const rule = (await ask(rules.length === 0 ? '    Rule (Enter to skip): ' : '    Another rule (Enter to finish): ')).trim();
    if (!rule) break;
    rules.push(rule);
  }
  if (rules.length > 0) {
    const added = saveRules(root, rules);
    if (added > 0) written.push(`${PRODUCT.projectDir}/${MEMORY_FILES.rules} (${added} rule${added > 1 ? 's' : ''})`);
    log(`    Saved ${rules.length} rule${rules.length > 1 ? 's' : ''}.`);
  } else {
    log('    Skipped.');
  }

  log('\nOnboarding complete.');
  if (written.length) {
    log('Saved:');
    for (const w of written) log(`  - ${w}`);
  }
  return { goal, rules, written };
}

/**
 * Line-based asker that keeps every input line, so answers typed ahead or piped
 * in are not lost, and treats end of input as "skip" instead of exiting mid-flow.
 */
export function createLineAsker(
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  const queued: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let closed = false;

  rl.on('line', (rawLine: string) => {
    const line = rawLine.replace(/^﻿/, ''); // some shells prefix piped input with a byte-order mark
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else queued.push(line);
  });
  rl.on('close', () => {
    closed = true;
    for (const resolve of waiting.splice(0)) resolve('');
  });

  const ask = async (question: string): Promise<string> => {
    output.write(question);
    let answer: string;
    const next = queued.shift();
    if (next !== undefined) answer = next;
    else if (closed) answer = '';
    else answer = await new Promise<string>(resolve => waiting.push(resolve));
    // Piped answers are not echoed by the terminal; show them so the log reads naturally
    if (!input.isTTY) output.write(`${answer}\n`);
    return answer;
  };

  return { ask, close: () => rl.close() };
}
