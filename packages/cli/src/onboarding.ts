import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { MEMORY_FILES, PRODUCT, PROJECT_GOAL_HEADING, PROJECT_RULES_HEADING, appendToSection, setSection, type SkillPack } from '@luci-dev/format';
import { detectProject, memoryDir } from '@luci-dev/brain';
import { SkillDiscovery, addPack, detectPacks, explainMatch, loadPacks, packSkills, readLock, selectSkills, writeCatalog, type SkillSource } from '@luci-dev/skills';

const MAX_RULES = 20;
const MEM = PRODUCT.projectDir;

/**
 * Parse a selection: Enter keeps all, "n"/"none" keeps none, numbers ("1,3" or "1 3")
 * keep only those. Returns 0-based indexes, or null if invalid.
 */
export function parseSelection(input: string, count: number): number[] | null {
  const answer = String(input ?? '').trim().toLowerCase();
  if (answer === '' || answer === 'y' || answer === 'yes' || answer === 'all') return [...Array(count).keys()];
  if (answer === 'n' || answer === 'no' || answer === 'none') return [];
  const indexes: number[] = [];
  for (const part of answer.split(/[\s,]+/).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > count) return null;
    if (!indexes.includes(n - 1)) indexes.push(n - 1);
  }
  return indexes;
}

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
  /** The skill library to suggest from. */
  registry: SkillSource;
  log?: (line: string) => void;
  /** Packs to offer (default: Luci's packs). */
  packs?: SkillPack[];
}

export interface OnboardingResult {
  goal: string;
  rules: string[];
  written: string[];
}

async function askSelection(ask: OnboardingOptions['ask'], log: (l: string) => void, question: string, count: number): Promise<number[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const picked = parseSelection(await ask(question), count);
    if (picked) return picked;
    log(`    Please press Enter, type n, or numbers between 1 and ${count}.`);
  }
  return [];
}

/**
 * Onboarding after `luci init`. Works for any kind of project:
 *   1. What are you building?                         -> .luci/context.md
 *   2. Skills that closely match the goal (if any)    -> .luci/skills.lock.json + project-skills.md
 *   3. Skill packs that fit the stack and goal        -> .luci/skills.lock.json (tagged with the pack)
 *   4. Rules your AI agents must always follow        -> .luci/rules.md
 * The code map step joins in M3.
 */
export async function runOnboarding(options: OnboardingOptions): Promise<OnboardingResult> {
  const { projectDir, ask, registry } = options;
  const log = options.log ?? ((line: string) => console.log(line));
  const root = memoryDir(projectDir);
  fs.mkdirSync(root, { recursive: true });
  const written: string[] = [];
  const steps = 4;
  const step = (n: number, title: string) => log(`\n[${n}/${steps}] ${title}`);

  log('\nProject onboarding (press Enter to skip any question)');

  step(1, 'What are you building?');
  log('    One line is enough, e.g. "Marketing site for a bakery" or "Design system for our dashboard".');
  const goal = (await ask('    > ')).trim();
  if (goal) {
    saveGoal(root, goal);
    written.push(`${MEM}/${MEMORY_FILES.context} (project goal)`);
    log('    Saved as the project goal.');
  } else {
    log('    Skipped.');
  }

  step(2, 'Suggested skills');
  if (!goal) {
    log('    Skipped: no goal to match skills against.');
    log(`    Later: ${PRODUCT.command} skills use "<your task>"`);
  } else {
    const scored = await new SkillDiscovery(registry).findRelevant(goal, { limit: 5, withScores: true });
    if (scored.length === 0) {
      log('    No skills in the library closely match this goal.');
      log(`    Browse them with: ${PRODUCT.command} skills   or search: ${PRODUCT.command} skills search "<keyword>"`);
    } else {
      log('    These skills match your goal. Your AI agent will follow them.');
      scored.forEach((e, i) => {
        const description = (e.skill.description ?? '').replace(/\s+/g, ' ').trim();
        log(`      ${i + 1}. ${e.skill.id}${description ? `  ${description.length > 70 ? `${description.slice(0, 67)}...` : description}` : ''}`);
        log(`         Why: ${explainMatch(e)}`);
      });
      const chosen = (await askSelection(ask, log, '    Use these? (Enter = all, numbers to keep only those e.g. "1,3", n = none) ', scored.length)).map(i => scored[i]).filter(e => e !== undefined);
      if (chosen.length) {
        for (const e of chosen) await selectSkills(projectDir, registry, [e.skill.id], `Matches the project goal: ${explainMatch(e)}`);
        await writeCatalog(projectDir, registry);
        written.push(`${MEM}/${MEMORY_FILES.skillsLock} + ${MEMORY_FILES.skillCatalog} (${chosen.length} skill${chosen.length > 1 ? 's' : ''})`);
        log(`    Selected for this project: ${chosen.map(e => e.skill.id).join(', ')}`);
      } else {
        log('    No skills selected.');
      }
    }
  }

  step(3, 'Skill packs for this project');
  const info = detectProject(projectDir);
  const chosenIds = new Set(readLock(projectDir).skills.map(s => s.id));
  const offers: { pack: SkillPack; reasons: string[]; fresh: string[] }[] = [];
  for (const { pack, reasons } of detectPacks(options.packs ?? loadPacks(), info, { projectDir, goal })) {
    const fresh = (await packSkills(pack, info, registry)).skills.map(s => s.id).filter(id => !chosenIds.has(id));
    if (fresh.length) offers.push({ pack, reasons, fresh });
  }
  if (offers.length === 0) {
    log(`    No packs fit this project${info.hasUi ? ' beyond the skills already chosen' : ''}. Browse them later with: ${PRODUCT.command} packs`);
  } else {
    log(`    Curated skill sets that fit your stack${goal ? ' and goal' : ''}:`);
    offers.forEach((o, i) => {
      log(`      ${i + 1}. ${o.pack.name}: ${o.pack.title} (${o.fresh.join(', ')})`);
      log(`         Why: ${o.reasons.join('; ')}`);
    });
    const picked = (await askSelection(ask, log, '    Add these packs? (Enter = all, numbers e.g. "1,2", n = none) ', offers.length)).map(i => offers[i]).filter(o => o !== undefined);
    if (picked.length) {
      let count = 0;
      for (const o of picked) count += (await addPack(projectDir, registry, o.pack, info)).added.length;
      await writeCatalog(projectDir, registry);
      written.push(`${MEM}/${MEMORY_FILES.skillsLock} (packs: ${picked.map(o => o.pack.name).join(', ')}; ${count} skill${count === 1 ? '' : 's'})`);
      log(`    Added: ${picked.map(o => o.pack.name).join(', ')}. Remove one any time with: ${PRODUCT.command} packs remove <name>`);
    } else {
      log(`    No packs added. Later: ${PRODUCT.command} packs`);
    }
  }

  step(4, 'Any rules your AI agents must always follow?');
  log('    e.g. "All API endpoints require auth", "Support Safari 15+", "Use the brand palette only".');
  const rules: string[] = [];
  while (rules.length < MAX_RULES) {
    const rule = (await ask(rules.length === 0 ? '    Rule (Enter to skip): ' : '    Another rule (Enter to finish): ')).trim();
    if (!rule) break;
    rules.push(rule);
  }
  if (rules.length > 0) {
    const added = saveRules(root, rules);
    if (added > 0) written.push(`${MEM}/${MEMORY_FILES.rules} (${added} rule${added > 1 ? 's' : ''})`);
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
): { ask: (question: string) => Promise<string>; close: () => void; isClosed: () => boolean } {
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
    if (!input.isTTY && answer !== null && answer !== undefined) output.write(`${answer}\n`);
    return answer;
  };

  return { ask, close: () => rl.close(), isClosed: () => closed };
}
