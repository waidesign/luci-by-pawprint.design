/**
 * Conflict detection (B12, v0.3.5): flags rules that contradict each other across the
 * user's Global Brain (~/.luci/brain) and the project's .luci/rules.md (or within rules.md).
 *
 * Two layers:
 *   1. Known mutually exclusive pairs and groups (indentation: tabs vs spaces, quotes:
 *      single vs double, semicolons, package manager: npm/pnpm/yarn/bun, exports: named vs
 *      default, modules: ESM vs CommonJS, components: function vs class).
 *   2. Opposite statements (always/must/use/allow/prefer/require vs never/must not/don't use/
 *      no/forbid/avoid/prohibit) on the same subject.
 *
 * Every reported conflict names both files and line numbers, quotes both rules, and states
 * which rule wins according to Luci's precedence order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci/format';
import { findProjectRoot, memoryDir, memoryPath } from '../layout/brainLayout.js';
import { DECISION_HISTORY_FILE } from './memoryEngine.js';
import { userBrainDir } from './paths.js';

export type RuleScope = 'project' | 'global';
export type Polarity = 'for' | 'against';

export interface RuleEntry {
  /** Display path, e.g. ".luci/rules.md" or "~/.luci/brain/coding-preferences.md". */
  file: string;
  /** 1-based line number in the file. */
  line: number;
  /** The rule text (without its list marker). */
  text: string;
  /** Whether the rule comes from the project (.luci/rules.md) or the Global Brain. */
  scope: RuleScope;
  /** Markdown section heading the rule sits under, if any. */
  section?: string;
}

export interface RuleConflict {
  /** Short topic or subject of the contradiction (e.g. "semicolons", "exports", "barrel file"). */
  subject: string;
  /** The project rule (or earlier rule when both are in .luci/rules.md). */
  project: RuleEntry;
  /** The contradicting rule from the Global Brain (or later rule in .luci/rules.md). */
  other: RuleEntry;
  /** Precedence explanation of which rule wins. */
  winner: string;
  /** One-line description with both files, line numbers, quotes and precedence. */
  summary: string;
  /** Actionable advice for `luci doctor`. */
  fix: string;
}

interface TopicStance {
  topic: string;
  choice: string;
  polarity: Polarity;
}

interface SubjectStatement {
  polarity: Polarity;
  tokens: string[];
}

const FENCE_RE = /^\s*(?:```|~~~)/;
const HEADING_RE = /^\s*#{1,6}\s+(.+?)\s*$/;
const LIST_ITEM_RE = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/;
const CHECKBOX_RE = /^\[[ xX]\]\s+/;
const BOLD_TITLE_RE = /^\*\*(?:[\d.]+\s+)?[^*]+\*\*\s*:\s*/;

const CONDITIONAL_EXCEPTION_RE = /\bonly\s+(?:if|when|where)\b|\bas a last resort\b|\bunless\b|\bexcept\s+(?:for|when|where|in)\b/i;
const NEGATIVE_RE = /\b(?:never|forbid|forbidden|prohibit|prohibited|disallow|disallowed|ban|banned|avoid|omit|omitted|omitting|eliminate)\b|\b(?:do not|don't|must not|mustn't|should not|shouldn't|cannot|can't|may not)\b|\b(?:no|zero|without)\s+(?!(?:longer|more than|fewer than|later than)\b)[a-z`]/i;
const POSITIVE_RE = /\b(?:always|must|require|required|enforce|enforced|use|using|prefer|preferred|allow|allowed|permit|permitted|keep|write|include|indent|style|format|stick to|exclusively|standardize)\b|\bonly\b/i;

const POLARITY_AND_FILLER_WORDS = new Set([
  'always', 'never', 'must', 'should', 'shall', 'may', 'can', 'will', 'would',
  'do', 'does', 'did', 'not', 'dont', 'mustnt', 'shouldnt', 'cannot', 'cant',
  'no', 'zero', 'without', 'avoid', 'avoiding', 'forbid', 'forbidden', 'forbidding',
  'prohibit', 'prohibited', 'prohibiting', 'disallow', 'disallowed', 'ban', 'banned',
  'omit', 'omitted', 'omitting', 'eliminate', 'eliminating',
  'use', 'using', 'used', 'prefer', 'preferring', 'preferred',
  'allow', 'allowing', 'allowed', 'permit', 'permitting', 'permitted',
  'require', 'requiring', 'required', 'enforce', 'enforcing', 'enforced',
  'keep', 'keeping', 'include', 'including', 'have', 'having', 'has',
  'set', 'setting', 'apply', 'applying', 'add', 'adding', 'enable', 'enabling',
  'support', 'supporting', 'stick', 'adopt', 'be', 'is', 'are', 'was', 'were', 'been', 'being',
  'make', 'making', 'write', 'writing',
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'into', 'onto',
  'upon', 'as', 'and', 'or', 'nor', 'if', 'when', 'where', 'while', 'all', 'every', 'each',
  'some', 'such', 'this', 'that', 'these', 'those', 'it', 'its', 'their', 'our', 'your', 'my',
  'we', 'you', 'they', 'only', 'exclusively', 'strictly', 'purely', 'solely', 'instead',
  'rather', 'than', 'over', 'across', 'throughout', 'within', 'inside', 'outside', 'around',
  'between', 'among', 'before', 'after', 'during', 'please', 'ensure'
]);

const SINGULAR_EXCEPTIONS = new Set([
  'css', 'less', 'sass', 'scss', 'pass', 'class', 'status', 'alias', 'canvas', 'nextjs',
  'vitest', 'cypress', 'express', 'postgres', 'redis', 'cors', 'serverless', 'headless',
  'axis', 'basis', 'analysis'
]);

function singularize(word: string): string {
  if (word.length <= 3 || SINGULAR_EXCEPTIONS.has(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes') || word.endsWith('sses')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('sis')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Extract bullet and numbered rules from a Markdown file, skipping fenced code blocks,
 * HTML comments and task-list checkboxes.
 */
export function extractRulesFromMarkdown(content: string, file: string, scope: RuleScope): RuleEntry[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const rules: RuleEntry[] = [];
  let inFence = false;
  let section: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*<!--/.test(line)) continue;

    const heading = HEADING_RE.exec(line);
    if (heading) {
      section = heading[1]!.trim();
      continue;
    }

    const item = LIST_ITEM_RE.exec(line);
    if (!item) continue;
    const body = item[1]!.trim();
    if (!body || CHECKBOX_RE.test(body) || body.startsWith('<!--')) continue;

    rules.push({
      file,
      line: i + 1,
      text: body,
      scope,
      ...(section ? { section } : {})
    });
  }
  return rules;
}

/** Split a rule line into clauses, turning contrastive tails ("instead of X") into negative clauses. */
function splitClauses(rawText: string): string[] {
  const body = rawText.replace(BOLD_TITLE_RE, '').trim();
  const sentences = body.split(/(?:\.\s+|;\s+|\s+—\s+|\s+--\s+)/).map(s => s.trim()).filter(Boolean);
  const clauses: string[] = [];

  for (const sentence of sentences) {
    if (CONDITIONAL_EXCEPTION_RE.test(sentence)) continue;

    const contrast = /\b(?:instead of|rather than)\b/i.exec(sentence);
    if (contrast && contrast.index > 0) {
      const head = sentence.slice(0, contrast.index).trim();
      const tail = sentence.slice(contrast.index + contrast[0].length).trim();
      if (head) clauses.push(head);
      if (tail) clauses.push(`never ${tail}`);
      continue;
    }

    const preferOver = /\b(prefer\s+[^,;]+?)\s+over\s+([^,;.]+)/i.exec(sentence);
    if (preferOver) {
      clauses.push(preferOver[1]!.trim(), `never ${preferOver[2]!.trim()}`);
      continue;
    }

    const commaNot = /^([^,]+),\s*not\s+([^,;.]+)$/i.exec(sentence);
    if (commaNot) {
      clauses.push(commaNot[1]!.trim(), `never ${commaNot[2]!.trim()}`);
      continue;
    }

    clauses.push(sentence);
  }
  return clauses;
}

function clausePolarity(clause: string): Polarity | null {
  if (CONDITIONAL_EXCEPTION_RE.test(clause)) return null;
  if (NEGATIVE_RE.test(clause)) return 'against';
  if (POSITIVE_RE.test(clause)) return 'for';
  return null;
}

function topicStancesOfClause(clause: string): TopicStance[] {
  const polarity = clausePolarity(clause);
  if (!polarity) return [];
  const lower = clause.toLowerCase();
  const stances: TopicStance[] = [];

  // 1. Indentation: tabs vs spaces (and 2 vs 4 vs 8 spaces)
  const isUiTab = /\b(?:tab\s+order|keyboard|browser\s+tab|active\s*tab|ui|nav(?:igation)?|panel|bar|focus|aria)\b/i.test(clause);
  const mentionsTabs = !isUiTab && /\btabs?\b/i.test(clause) && (
    /\bindent(?:ation|ing)?\b|\bspaces\b/i.test(clause) ||
    /\b(?:use|prefer|with|enforce|indent|never|no|avoid|forbid)\s+tabs?\b|\btabs?\s+only\b/i.test(clause)
  );
  const spaceMatch = !/\b(?:whitespace|white\s+space|aspect-ratio\s+space|color\s+space)\b/i.test(clause)
    ? /\b([248])\s+spaces\b|\b(?:indent(?:ation|ing)?\s+(?:with\s+)?|use\s+|prefer\s+|never\s+use\s+|no\s+)spaces\b|\bspaces\s+(?:for\s+indent(?:ation)?|only|over\s+tabs?|instead\s+of\s+tabs?)\b/i.exec(clause)
    : null;
  if (mentionsTabs) stances.push({ topic: 'indentation', choice: 'tabs', polarity });
  if (spaceMatch) {
    stances.push({ topic: 'indentation', choice: 'spaces', polarity });
    if (spaceMatch[1]) stances.push({ topic: 'indentation', choice: `${spaceMatch[1]} spaces`, polarity });
  }

  // 2. Quotes: single vs double
  if (/\bsingle[- ]quotes?\b|\bsingle[- ]quoted\b/i.test(lower)) {
    stances.push({ topic: 'quotes', choice: 'single quotes', polarity });
  }
  if (/\bdouble[- ]quotes?\b|\bdouble[- ]quoted\b/i.test(lower)) {
    stances.push({ topic: 'quotes', choice: 'double quotes', polarity });
  }

  // 3. Semicolons
  if (/\bsemi-?colons?\b/i.test(lower)) {
    stances.push({ topic: 'semicolons', choice: 'semicolons', polarity });
  }

  // 4. Package manager: npm, pnpm, yarn, bun (when prescribing the manager, not running a script like `pnpm test`)
  const pms = [...lower.matchAll(/\b(pnpm|npm|yarn|bun)\b/g)].map(m => m[1]!);
  const uniquePms = [...new Set(pms)];
  if (
    uniquePms.length === 1 &&
    !/\b(?:pnpm|npm|yarn|bun)\s+(?:test|typecheck|check|build|dev|lint|start|run|exec|dlx|init|--filter|-w)\b/i.test(clause) &&
    !/\bpackage manager\s*\(`?(?:pnpm|npm|yarn|bun)`?\)/i.test(clause) &&
    /\b(?:use|prefer|always|never|forbid|avoid|do not|don't|must|require|stick to|only|install with|manage packages with|package manager)\b/i.test(clause)
  ) {
    stances.push({ topic: 'package manager', choice: uniquePms[0]!, polarity });
  }

  // 5. Exports: named vs default
  if (/\bnamed\s+exports?\b/i.test(lower)) {
    stances.push({ topic: 'exports', choice: 'named exports', polarity });
  }
  if (/\bdefault\s+exports?\b/i.test(lower)) {
    stances.push({ topic: 'exports', choice: 'default exports', polarity });
  }

  // 6. Module system: ESM vs CommonJS
  if (/\b(?:es\s+modules?|esm)\b/i.test(lower)) {
    stances.push({ topic: 'modules', choice: 'esm', polarity });
  }
  if (/\b(?:commonjs|cjs)\b/i.test(lower)) {
    stances.push({ topic: 'modules', choice: 'commonjs', polarity });
  }

  // 7. Components: function vs class
  if (/\bfunction(?:al)?\s+components?\b/i.test(lower)) {
    stances.push({ topic: 'components', choice: 'function components', polarity });
  }
  if (/\bclass(?:-based)?\s+components?\b/i.test(lower)) {
    stances.push({ topic: 'components', choice: 'class components', polarity });
  }

  return stances;
}

function subjectStatementOfClause(clause: string): SubjectStatement | null {
  const polarity = clausePolarity(clause);
  if (!polarity) return null;

  // Strip parenthetical examples ("(e.g., ...)") so examples don't pollute the subject
  const withoutExamples = clause.replace(/\((?:e\.g\.|for example|such as|i\.e\.)[^)]*\)/gi, ' ');

  // Keep backticked technical tokens such as `any` or `var` even if they look like stopwords
  const codeTokens = [...withoutExamples.matchAll(/`([a-zA-Z0-9_.-]+)`/g)]
    .map(m => m[1]!.toLowerCase())
    .filter(t => t.length >= 2);

  const rawWords = withoutExamples
    .toLowerCase()
    .replace(/[`"'()*[\]{}:;,.!?/\\<>+=~^|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  const seen = new Set<string>();
  const add = (w: string) => {
    if (!seen.has(w)) {
      seen.add(w);
      tokens.push(w);
    }
  };

  // Preserve `any` when used as the TypeScript type ("use any", "never use any", "avoid any")
  if (/\b(?:use|using|avoid|forbid|never|no|allow|disallow)\s+`?any`?(?:\s+types?)?\b/i.test(withoutExamples)) {
    add('any');
  }
  for (const ct of codeTokens) {
    if (!POLARITY_AND_FILLER_WORDS.has(ct) || ct === 'any') add(singularize(ct));
  }
  for (const word of rawWords) {
    if (word.length < 2 || /^\d+$/.test(word)) continue;
    if (POLARITY_AND_FILLER_WORDS.has(word)) continue;
    add(singularize(word));
  }

  if (tokens.length === 0 || tokens.length > 8) return null;
  return { polarity, tokens };
}

function topicsConflict(a: TopicStance, b: TopicStance): boolean {
  if (a.topic !== b.topic) return false;
  if (a.choice === b.choice) return a.polarity !== b.polarity;
  // Mutually exclusive choices within the same topic conflict when both are endorsed ('for')
  if (a.polarity === 'for' && b.polarity === 'for') {
    if (a.topic === 'indentation' && ((a.choice === 'spaces' && b.choice.endsWith('spaces')) || (b.choice === 'spaces' && a.choice.endsWith('spaces')))) {
      return false;
    }
    return true;
  }
  return false;
}

function subjectsConflict(a: SubjectStatement, b: SubjectStatement): string | null {
  if (a.polarity === b.polarity) return null;
  const [small, large] = a.tokens.length <= b.tokens.length ? [a, b] : [b, a];
  const largeSet = new Set(large.tokens);

  if (small.tokens.length === 1) {
    if (large.tokens.length <= 2 && largeSet.has(small.tokens[0]!)) return small.tokens[0]!;
    return null;
  }

  if (!small.tokens.every(t => largeSet.has(t))) return null;
  if (small.tokens.length / large.tokens.length < 0.5) return null;
  return small.tokens.join(' ');
}

function shortQuote(text: string): string {
  const cleaned = text.replace(BOLD_TITLE_RE, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 110 ? `${cleaned.slice(0, 107).trimEnd()}...` : cleaned;
}

function winnerDescription(project: RuleEntry, other: RuleEntry): { winner: string; fix: string } {
  const rulesFile = memoryPath(MEMORY_FILES.rules);
  const globalDir = `~/${PRODUCT.homeDir}/brain`;
  const projectIsSafety = /^safety\b/i.test(project.section ?? '');
  const otherIsSafety = /^safety\b/i.test(other.section ?? '');

  if (project.scope === 'project' && other.scope === 'global') {
    const winner = projectIsSafety
      ? `Safety rules in ${rulesFile} win over Global Brain (${globalDir})`
      : `${rulesFile} wins over Global Brain (${globalDir})`;
    const fix = `Keep ${rulesFile} as the project override (it takes precedence), or edit ${rulesFile} or ${other.file} so they agree.`;
    return { winner, fix };
  }

  if (projectIsSafety && !otherIsSafety) {
    return {
      winner: `Safety rules in ${rulesFile} win over other sections in ${rulesFile}`,
      fix: `Remove or edit line ${other.line} in ${rulesFile} so it does not contradict the Safety section.`
    };
  }
  if (otherIsSafety && !projectIsSafety) {
    return {
      winner: `Safety rules in ${rulesFile} win over other sections in ${rulesFile}`,
      fix: `Remove or edit line ${project.line} in ${rulesFile} so it does not contradict the Safety section.`
    };
  }
  return {
    winner: `both rules are in ${rulesFile} at the same precedence level`,
    fix: `Edit ${rulesFile} (lines ${project.line} and ${other.line}) so only one rule remains.`
  };
}

function buildConflict(subject: string, project: RuleEntry, other: RuleEntry): RuleConflict {
  const { winner, fix } = winnerDescription(project, other);
  const summary = `${project.file}:${project.line} ("${shortQuote(project.text)}") contradicts ${other.file}:${other.line} ("${shortQuote(other.text)}") on ${subject} — Precedence: ${winner}.`;
  return { subject, project, other, winner, summary, fix };
}

const isPackageSection = (s?: string) => Boolean(s && /^Package(?:\s+Rules)?:\s*/i.test(s));

function comparePair(a: RuleEntry, b: RuleEntry): RuleConflict | null {
  if (isPackageSection(a.section) && isPackageSection(b.section) && a.section?.toLowerCase().trim() !== b.section?.toLowerCase().trim()) {
    return null;
  }
  const clausesA = splitClauses(a.text);
  const clausesB = splitClauses(b.text);

  const topicsA = clausesA.flatMap(topicStancesOfClause);
  const topicsB = clausesB.flatMap(topicStancesOfClause);
  for (const ta of topicsA) {
    for (const tb of topicsB) {
      if (topicsConflict(ta, tb)) return buildConflict(ta.topic, a, b);
    }
  }

  const subjectsA = clausesA.map(subjectStatementOfClause).filter((x): x is SubjectStatement => x !== null);
  const subjectsB = clausesB.map(subjectStatementOfClause).filter((x): x is SubjectStatement => x !== null);
  for (const sa of subjectsA) {
    for (const sb of subjectsB) {
      const subject = subjectsConflict(sa, sb);
      if (subject) return buildConflict(subject, a, b);
    }
  }

  return null;
}

/**
 * Pure conflict finder: compares each project rule against global rules (and against
 * other project rules in .luci/rules.md).
 */
export function findRuleConflicts(projectRules: readonly RuleEntry[], globalRules: readonly RuleEntry[] = []): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  // 1. Project rules vs Global Brain rules
  for (const proj of projectRules) {
    for (const glob of globalRules) {
      const conflict = comparePair(proj, glob);
      if (conflict) conflicts.push(conflict);
    }
  }

  // 2. Contradictions within .luci/rules.md itself
  for (let i = 0; i < projectRules.length; i++) {
    for (let j = i + 1; j < projectRules.length; j++) {
      const conflict = comparePair(projectRules[i]!, projectRules[j]!);
      if (conflict) conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Read a project's .luci/rules.md and the user's Global Brain (~/.luci/brain/*.md)
 * and return every rule conflict between them.
 */
export function detectProjectRuleConflicts(
  projectDir: string,
  globalBrainDir: string = userBrainDir()
): RuleConflict[] {
  const root = findProjectRoot(projectDir).root;
  const rulesPath = path.join(memoryDir(root), MEMORY_FILES.rules);
  if (!fs.existsSync(rulesPath)) return [];

  const projectRules = extractRulesFromMarkdown(
    fs.readFileSync(rulesPath, 'utf8'),
    memoryPath(MEMORY_FILES.rules),
    'project'
  );
  if (!projectRules.length) return [];

  const globalRules: RuleEntry[] = [];
  if (fs.existsSync(globalBrainDir)) {
    const files = fs.readdirSync(globalBrainDir)
      .filter(f => f.endsWith('.md') && f !== 'README.md' && f !== DECISION_HISTORY_FILE)
      .sort();
    for (const file of files) {
      const full = path.join(globalBrainDir, file);
      if (!fs.statSync(full).isFile()) continue;
      globalRules.push(
        ...extractRulesFromMarkdown(
          fs.readFileSync(full, 'utf8'),
          `~/${PRODUCT.homeDir}/brain/${file}`,
          'global'
        )
      );
    }
  }

  return findRuleConflicts(projectRules, globalRules);
}
