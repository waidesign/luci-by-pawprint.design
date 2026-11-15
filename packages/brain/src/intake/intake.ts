/**
 * PRD intake (B10): fit a PRD and supporting docs into the project's memory.
 *
 * Runs locally, without a model: each doc is split into sections by heading, and each
 * section is placed by what its heading says.
 *   - Goal, architecture and conventions sections fill the matching section of context.md,
 *     but only while it still says "Not written yet". Text a person wrote is never replaced.
 *   - Everything else becomes a proposal in .luci/memory/proposed/ for a person to accept
 *     or delete: candidate rules (must / never / always statements), non-goals, acceptance
 *     criteria, decisions, the stack, and a pointer to the doc itself.
 * The docs themselves stay where they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT, formatProposal, sectionBody, setSection, stripBom, type Proposal } from '@luci-dev/format';
import { memoryDir, memoryPath } from '../layout/brainLayout.js';

export const INTAKE_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt'] as const;
export const MAX_INTAKE_BYTES = 2 * 1024 * 1024;
const MAX_RULES = 20;
const MAX_ITEMS = 12;
const MAX_PARAGRAPH = 700;
const PLACEHOLDER = '_Not written yet';

export interface DocSection {
  level: number;
  title: string;
  /** Body lines, without the subsections. */
  lines: string[];
}

export type SectionKind = 'goal' | 'nonGoals' | 'architecture' | 'conventions' | 'done' | 'decisions' | 'stack';

// Checked in order: "Non-goals" must not count as a goal
const KINDS: readonly [SectionKind, RegExp][] = [
  ['nonGoals', /\b(non-?goals?|out of scope|not in scope|won'?t do|anti-?goals?)\b/i],
  ['done', /\b(acceptance criteria|definition of done|success criteria|done when|exit criteria)\b/i],
  ['decisions', /\b(decisions?( log| record)?|trade-?offs?|adrs?)\b/i],
  ['stack', /\b(tech(nology)? stack|stack)\b/i],
  ['conventions', /\b(conventions?|coding standards?|style guide|naming)\b/i],
  ['architecture', /\b(architecture|system design|technical design|technical (overview|approach)|system overview|how it works|data flow)\b/i],
  ['goal', /\b(summary|overview|goals?|vision|purpose|problem( statement)?|about|introduction|mission|elevator pitch|tl;?dr)\b/i]
];
// "Goals and non-goals" is mostly goals; "Decisions still to settle" holds no decisions yet
const GOALS_AND_NON_GOALS = /\bgoals?\s+(and|&)\s+non-?goals?\b/i;
const UNSETTLED = /\b(still|to settle|open|pending|proposed|undecided)\b/i;

// A rule states an obligation ("must", "shall"), or starts with one ("Never...", "Do not...", "No...").
// In list items, "never" and "always" also count ("The app never stores card numbers").
const MODAL = /\b(must(?!-)|shall|should not|shouldn't|is required|are required|required to)\b/i;
const IMPERATIVE_START = /^(never|always|do not|don't|avoid|only|no)\b/i;
const LIST_RULE = /\b(never|always)\b/i;
// Sections that describe the world rather than set rules
const DESCRIPTIVE = /\b(problem|risks?|open questions|background|history|research|personas?)\b/i;

/** "## 2. Goals" -> "Goals"; "Part 4: Build brief" -> "Build brief". */
const cleanTitle = (title: string) =>
  title.replace(/[*_`]/g, '').replace(/^\s*(part|section|chapter)?\s*[\d.]+[:.)]?\s+/i, '').replace(/^part \d+:\s*/i, '').trim();
/** Plain text of a Markdown line: no list marker, emphasis, links or inline code ticks. */
const plain = (line: string) =>
  line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|\*|_)(\S(?:.*?\S)?)\1/g, '$2')
    .trim();
const isListItem = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
const isTableRow = (line: string) => /^\s*\|/.test(line);

export function kindOf(title: string): SectionKind | null {
  const clean = cleanTitle(title);
  if (GOALS_AND_NON_GOALS.test(clean)) return 'goal';
  const kind = KINDS.find(([, re]) => re.test(clean))?.[0] ?? null;
  return kind === 'decisions' && UNSETTLED.test(clean) ? null : kind;
}

/** Split a doc into sections by heading. Code blocks and HTML comments are left out. A doc without headings is one section. */
export function splitSections(text: string, fallbackTitle: string): DocSection[] {
  const lines = stripBom(text).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const sections: DocSection[] = [];
  let current: DocSection = { level: 0, title: fallbackTitle, lines: [] };
  let fence: string | null = null;
  for (const line of lines) {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]!; continue; }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      if (current.level > 0 || current.lines.some(l => l.trim())) sections.push(current);
      current = { level: h[1]!.length, title: h[2]!.trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.level > 0 || current.lines.some(l => l.trim())) sections.push(current);
  return sections;
}

/** The first prose paragraph of a section, or its first list items when it has no prose. */
export function leadText(section: DocSection): string {
  const paragraphs: string[][] = [];
  let block: string[] = [];
  for (const line of section.lines) {
    if (!line.trim()) { if (block.length) paragraphs.push(block); block = []; } else block.push(line);
  }
  if (block.length) paragraphs.push(block);
  const prose = paragraphs.find(p => !p.every(isListItem) && !p.some(isTableRow) && !/^\s*>/.test(p[0] ?? ''));
  if (prose) {
    const text = prose.map(l => l.trim()).join(' ').replace(/\s+/g, ' ');
    return text.length > MAX_PARAGRAPH ? `${text.slice(0, MAX_PARAGRAPH).replace(/\s+\S*$/, '')}...` : text;
  }
  return listItems(section).slice(0, 5).map(i => `- ${i}`).join('\n');
}

export function listItems(section: DocSection): string[] {
  return section.lines.filter(isListItem).map(plain).filter(Boolean);
}

/** Sentences and list items that state a rule (must, never, always, do not...). */
export function ruleCandidates(section: DocSection): string[] {
  const out: string[] = [];
  for (const line of section.lines) {
    if (!line.trim() || isTableRow(line)) continue;
    const item = isListItem(line);
    for (const part of plain(line).split(/(?<=[.!?])\s+(?=[A-Z])/)) {
      const s = part.trim();
      if (s.length < 12 || s.length > 240) continue;
      if (MODAL.test(s) || IMPERATIVE_START.test(s) || (item && LIST_RULE.test(s))) out.push(s);
    }
  }
  return out;
}

export interface DocAnalysis {
  /** Project-relative path (or absolute, for a doc outside the project). */
  source: string;
  title: string;
  sections: string[];
  goal: { text: string; from: string } | null;
  architecture: { text: string; from: string } | null;
  conventions: { text: string; from: string } | null;
  rules: { text: string; from: string }[];
  nonGoals: { text: string; from: string }[];
  done: { text: string; from: string }[];
  decisions: { text: string; from: string }[];
  stack: { text: string; from: string }[];
}

/** Read one doc and sort its content by where it belongs. Pure: writes nothing. */
export function analyzeDoc(text: string, source: string): DocAnalysis {
  const base = path.basename(source).replace(/\.[^.]+$/, '');
  const sections = splitSections(text, base);
  const title = cleanTitle(sections.find(s => s.level === 1)?.title ?? base);
  const result: DocAnalysis = {
    source, title, sections: sections.filter(s => s.level > 0).map(s => cleanTitle(s.title)),
    goal: null, architecture: null, conventions: null, rules: [], nonGoals: [], done: [], decisions: [], stack: []
  };
  const items = (s: DocSection) => {
    const list = listItems(s);
    const rows = s.lines.filter(l => isTableRow(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
      .map(l => l.split('|').map(c => plain(c)).filter(Boolean).join(': '));
    return [...list, ...rows.slice(1)].slice(0, MAX_ITEMS);
  };
  const seen = new Set<string>();
  for (const s of sections) {
    const from = cleanTitle(s.title);
    const kind = s.level > 0 ? kindOf(s.title) : null;
    const lead = leadText(s);
    if (kind === 'goal' && !result.goal && lead) result.goal = { text: lead, from };
    else if (kind === 'architecture' && !result.architecture && lead) result.architecture = { text: lead, from };
    else if (kind === 'conventions' && !result.conventions && lead) result.conventions = { text: lead, from };
    else if (kind === 'nonGoals') result.nonGoals.push(...items(s).map(t => ({ text: t, from })));
    else if (kind === 'done') result.done.push(...items(s).map(t => ({ text: t, from })));
    else if (kind === 'decisions') result.decisions.push(...items(s).map(t => ({ text: t, from })));
    else if (kind === 'stack') result.stack.push(...(items(s).length ? items(s) : lead ? [lead] : []).map(t => ({ text: t, from })));
    if (kind !== 'nonGoals' && !DESCRIPTIVE.test(from)) {
      for (const r of ruleCandidates(s)) {
        const key = r.toLowerCase();
        if (!seen.has(key) && result.rules.length < MAX_RULES) { seen.add(key); result.rules.push({ text: r, from }); }
      }
    }
  }
  return result;
}

export interface IntakeReport {
  projectPath: string;
  initialized: boolean;
  dryRun: boolean;
  docs: { source: string; title: string; sections: number }[];
  /** context.md sections filled because they were still empty. */
  filled: { section: string; source: string }[];
  /** Proposal files written (or, in a dry run, that would be). */
  proposals: { file: string; topic: string; belongsIn: Proposal['belongsIn'] }[];
  /** Files that could not be read, with the reason. */
  errors: string[];
}

const today = () => new Date().toISOString().slice(0, 10);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'intake';
const bullets = (list: { text: string; from: string }[]) => `\n${list.map(i => `  - ${i.text.replace(/\s*\n\s*/g, ' ')} (from "${i.from}")`).join('\n')}`;

/** Proposals for one doc, in review order. */
function proposalsFor(doc: DocAnalysis, handled: Record<'goal' | 'architecture' | 'conventions', boolean>): Proposal[] {
  const where = `\`${PRODUCT.command} intake\` read ${doc.source}`;
  // Short enough for a file name and a list line
  const name = doc.title.length <= 40 ? doc.title : path.basename(doc.source);
  const out: Proposal[] = [];
  if (doc.rules.length) {
    out.push({ topic: `Rules from ${name}`, whatHappened: `${where}; these statements read like rules. Keep the ones that should apply to every task.`, proposed: bullets(doc.rules), belongsIn: 'rules.md' });
  }
  if (doc.nonGoals.length) {
    out.push({ topic: `Out of scope in ${name}`, whatHappened: `${where}; it lists what the project will not do.`, proposed: bullets(doc.nonGoals.map(i => ({ ...i, text: `Out of scope: ${i.text}` }))), belongsIn: 'rules.md' });
  }
  if (doc.done.length) {
    out.push({ topic: `Acceptance criteria from ${name}`, whatHappened: `${where}; it says when work counts as done. Add the ones that apply to every change to the Definition of Done.`, proposed: bullets(doc.done), belongsIn: 'context.md' });
  }
  if (doc.decisions.length) {
    out.push({ topic: `Decisions in ${name}`, whatHappened: `${where}; it records decisions already made. Turn each one that still holds into a decision record.`, proposed: bullets(doc.decisions), belongsIn: 'decisions/' });
  }
  if (doc.stack.length) {
    out.push({ topic: `Stack in ${name}`, whatHappened: `${where}; it names the stack. The Stack section of context.md is detected from the project's files, so add anything planned but not installed yet under Architecture Notes.`, proposed: bullets(doc.stack), belongsIn: 'context.md' });
  }
  for (const [key, label] of [['goal', 'Project Goal'], ['architecture', 'Architecture Notes'], ['conventions', 'Conventions']] as const) {
    const found = doc[key];
    if (found && !handled[key]) {
      out.push({ topic: `${label} from ${name}`, whatHappened: `${where}; the ${label} section of context.md is already written, so it was not changed.`, proposed: `\n  ${found.text.replace(/\n/g, '\n  ')}\n  (from "${found.from}")`, belongsIn: 'context.md' });
    }
  }
  out.push({
    topic: `Reference doc: ${name}`,
    whatHappened: `${where}. Agents should know it exists and open only the section a task needs.`,
    proposed: `Add under Architecture Notes in context.md: "${doc.title}: ${doc.source}"${doc.sections.length ? `, sections: ${doc.sections.slice(0, 15).join(', ')}${doc.sections.length > 15 ? ', ...' : ''}` : ''}.`,
    belongsIn: 'context.md'
  });
  return out;
}

/**
 * Fit docs into the project's memory (see the top of this file). Returns what was filled
 * and proposed; with dryRun nothing is written. A proposal identical to one already waiting
 * is not written again.
 */
export function intakeDocs(projectDir: string, files: readonly string[], options: { dryRun?: boolean } = {}): IntakeReport {
  const dir = path.resolve(projectDir);
  const dryRun = Boolean(options.dryRun);
  const report: IntakeReport = { projectPath: dir, initialized: fs.existsSync(memoryDir(dir)), dryRun, docs: [], filled: [], proposals: [], errors: [] };
  if (!report.initialized) return report;

  const contextFile = path.join(memoryDir(dir), MEMORY_FILES.context);
  let context = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8') : '';
  const isEmpty = (heading: string) => {
    const body = sectionBody(context, heading);
    return context.includes(heading) && (!body || body.startsWith(PLACEHOLDER));
  };
  const proposedDir = path.join(memoryDir(dir), MEMORY_FILES.proposedMemory);
  const waiting = new Set(fs.existsSync(proposedDir) ? fs.readdirSync(proposedDir).map(f => fs.readFileSync(path.join(proposedDir, f), 'utf8')) : []);
  const taken = new Set(fs.existsSync(proposedDir) ? fs.readdirSync(proposedDir) : []);

  for (const file of files) {
    const abs = path.resolve(dir, file);
    const relative = path.relative(dir, abs);
    const source = relative.startsWith('..') || path.isAbsolute(relative) ? abs : relative.replace(/\\/g, '/');
    const ext = path.extname(abs).toLowerCase();
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { report.errors.push(`${file}: not found`); continue; }
    if (!(INTAKE_EXTENSIONS as readonly string[]).includes(ext)) { report.errors.push(`${file}: only ${INTAKE_EXTENSIONS.join(', ')} files can be read; save it as Markdown first`); continue; }
    if (fs.statSync(abs).size > MAX_INTAKE_BYTES) { report.errors.push(`${file}: larger than ${MAX_INTAKE_BYTES / 1024 / 1024} MB`); continue; }

    const doc = analyzeDoc(fs.readFileSync(abs, 'utf8'), source);
    report.docs.push({ source, title: doc.title, sections: doc.sections.length });

    // handled: nothing to propose for it (filled now, or the section already holds this text)
    const handled = { goal: false, architecture: false, conventions: false };
    for (const [key, heading] of [['goal', '## Project Goal'], ['architecture', '## Architecture Notes'], ['conventions', '## Conventions']] as const) {
      const found = doc[key];
      if (!found) continue;
      if (sectionBody(context, heading).includes(found.text)) { handled[key] = true; continue; }
      if (!isEmpty(heading)) continue;
      context = setSection(context, heading, `${found.text}\n\n_From ${source} ("${found.from}"), by \`${PRODUCT.command} intake\`. Edit freely._`);
      handled[key] = true;
      report.filled.push({ section: `${MEMORY_FILES.context} ${heading.slice(3)}`, source });
    }

    for (const proposal of proposalsFor(doc, handled)) {
      const text = formatProposal(proposal);
      if (waiting.has(text)) continue;
      const base = `${today()}-${slug(proposal.topic)}`;
      let name = `${base}.md`;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}.md`;
      taken.add(name);
      waiting.add(text);
      if (!dryRun) {
        fs.mkdirSync(proposedDir, { recursive: true });
        fs.writeFileSync(path.join(proposedDir, name), text, 'utf8');
      }
      report.proposals.push({ file: memoryPath(`${MEMORY_FILES.proposedMemory}/${name}`), topic: proposal.topic, belongsIn: proposal.belongsIn });
    }
  }
  if (!dryRun && report.filled.length) fs.writeFileSync(contextFile, context, 'utf8');
  return report;
}
