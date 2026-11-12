/**
 * Luci Skill Standard (LSS) helpers: read/write skill folders, convert any skill to
 * LSS, record verified licences, and split oversized skills.
 * See docs/format/skill-standard.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRACT_FILE,
  LSS_VERSION,
  META,
  PRODUCT,
  SKILL_FILE,
  fmMap,
  formatSkillContract,
  parseFrontmatter,
  parseSkillContract,
  stringifyFrontmatter,
  type FrontmatterMap,
  type LicenseCategory,
  type SkillContract
} from '@luci/format';
import { estimateTokens } from './types.js';

export const MAX_BODY_TOKENS = 5000;
export const SPLIT_TARGET_TOKENS = 3500;
// Reference files group neighbouring sections so agents open a few useful files, not dozens of tiny ones
const GROUP_MIN_TOKENS = 1200;
const GROUP_MAX_TOKENS = 3000;
const INDEX_HEADING = '## Detailed references';

export interface SkillFolder {
  data: Record<string, unknown>;
  content: string;
  contract: SkillContract;
}

export function readSkillFolder(dir: string): SkillFolder {
  const { data, content } = parseFrontmatter(fs.readFileSync(path.join(dir, SKILL_FILE), 'utf8'));
  const contractFile = path.join(dir, CONTRACT_FILE);
  let contract: SkillContract = { lss: LSS_VERSION };
  if (fs.existsSync(contractFile)) {
    const r = parseSkillContract(fs.readFileSync(contractFile, 'utf8'));
    if (!r.ok) throw new Error(`${path.join(dir, CONTRACT_FILE)}: ${r.error}`);
    contract = r.value;
  }
  return { data, content, contract };
}

export function writeSkillFolder(dir: string, skill: { data: Record<string, unknown>; content: string; contract?: SkillContract | null }): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, SKILL_FILE), stringifyFrontmatter(skill.data, skill.content), 'utf8');
  if (skill.contract) fs.writeFileSync(path.join(dir, CONTRACT_FILE), formatSkillContract(skill.contract), 'utf8');
}

export interface LicenseResult {
  spdx: string | null;
  category: LicenseCategory;
  evidence: string;
  url: string | null;
}

/** Record a resolved licence in SKILL.md and luci.json. Unknown licences are recorded as UNKNOWN, never guessed. */
export function applyLicense(dir: string, result: LicenseResult, checkedAt = new Date().toISOString().slice(0, 10)): SkillFolder {
  const skill = readSkillFolder(dir);
  skill.data['license'] = result.spdx ?? 'UNKNOWN';
  skill.contract.source = {
    ...(skill.contract.source ?? {}),
    licenseVerified: Boolean(result.spdx),
    licenseStatus: result.category,
    licenseEvidence: result.evidence,
    licenseUrl: result.url,
    licenseCheckedAt: checkedAt
  };
  writeSkillFolder(dir, skill);
  return skill;
}

/** Whether a licence allows Luci to restructure (modify) a skill. */
export const canModify = (licenseStatus: LicenseCategory | undefined) => licenseStatus === 'open' || licenseStatus === 'copyleft';

// ---------- Converting any skill to LSS ----------

const STANDARD_FIELDS = ['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata'];
const PLACEHOLDERS = new Set(['>', '>-', '>+', '|', '|-', '|+']);

/** Lowercase-hyphen skill name from any title ("My Cool Skill!" -> "my-cool-skill"). */
export function toSkillName(text: string | undefined | null): string {
  return String(text ?? '').toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
}

/** First prose paragraph of a body, as a fallback description. */
export function deriveDescription(body: string, fallback: string): string {
  for (const p of String(body ?? '').split(/\n\s*\n/).map(x => x.trim())) {
    if (!p || /^(#|```|\||<|-|>|\*\s)/.test(p)) continue;
    const text = p.replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
    if (text.length >= 30) return text.length > 300 ? `${text.slice(0, 297).replace(/\s+\S*$/, '')}…` : text;
  }
  return fallback;
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(',').map(s => s.trim()).filter(Boolean));
const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

/**
 * Convert parsed frontmatter + body from any skill format (Agent Skills SKILL.md,
 * legacy single-file skills, or plain markdown) into LSS { data, contract, warnings }.
 * Non-standard top-level fields move into metadata (luci-*) or luci.json.
 */
export function convertToLss(args: {
  data?: FrontmatterMap | Record<string, unknown>;
  content?: string;
  nameHint?: string;
  category?: string;
  existingContract?: SkillContract | null;
  raw?: Record<string, string>;
}): { data: Record<string, unknown> & { name: string; description: string; metadata: Record<string, string> }; contract: SkillContract; warnings: string[] } {
  const data = (args.data ?? {}) as Record<string, unknown>;
  const content = args.content ?? '';
  const category = args.category ?? 'general';
  const raw = args.raw ?? {};
  const warnings: string[] = [];
  // Agent Skills names must match the folder, so the folder (nameHint) wins over a differing `name`
  const name = toSkillName(str(data['id']) || args.nameHint || str(data['name']));
  if (!name) throw new Error('Could not work out a skill name. Use --name <skill-name>.');

  let description = str(data['description']).replace(/\s+/g, ' ').trim();
  if (!description || PLACEHOLDERS.has(description)) {
    description = deriveDescription(content, '');
    if (description) warnings.push('No description found: one was derived from the skill text. Review it.');
    else {
      description = `${name} skill.`;
      warnings.push('No description found: add one that says what the skill does and when to use it.');
    }
  }
  if (description.length > 1024) {
    description = `${description.slice(0, 1020).replace(/\s+\S*$/, '')}…`;
    warnings.push('Description was longer than 1024 characters and was shortened.');
  }

  const upstreamMeta = fmMap(data['metadata'] as FrontmatterMap[string] | undefined);
  const upstream = (key: string) => str(upstreamMeta[key]);
  const dataName = str(data['name']);
  const title = dataName && toSkillName(dataName) !== dataName ? dataName : upstream(META.title);
  const tags = asList(data['tags'] ?? upstreamMeta[META.tags]).filter(t => t !== name && t !== category && t !== 'skills.sh');

  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(upstreamMeta)) metadata[k] = str(v);
  const set = (key: string, value: string | undefined) => { if (value) metadata[key] = value; else delete metadata[key]; };
  set(META.title, title || undefined);
  set(META.category, category);
  set(META.author, str(data['author']) || upstream(META.author) || upstream('author') || 'unknown');
  set(META.version, str(data['version']) || upstream(META.version) || upstream('version') || '1.0.0');
  set(META.tags, tags.length ? tags.join(', ') : undefined);

  const out: Record<string, unknown> & { name: string; description: string; metadata: Record<string, string> } = {
    name,
    description,
    ...(data['license'] ? { license: str(data['license']) } : {}),
    ...(data['compatibility'] ? { compatibility: str(data['compatibility']) } : {}),
    ...(data['allowed-tools'] ? { 'allowed-tools': str(data['allowed-tools']) } : {}),
    metadata
  };

  // summary and other ranking fields are filled by enrichContract, which records them in `derived`
  const contract: SkillContract = { lss: LSS_VERSION, ...(args.existingContract ?? {}) };
  const deps = asList(data['dependencies'] ?? data['dependsOn']);
  if (deps.length && !contract.dependsOn) contract.dependsOn = deps;
  const related = asList(data['relatedSkills'] ?? data['related']);
  if (related.length && !contract.related) contract.related = related;
  const frameworks = asList(data['frameworks']).filter(f => f !== 'any');
  if (frameworks.length && !contract.frameworks) contract.frameworks = frameworks;
  if (!contract.lastVerified) contract.lastVerified = new Date().toISOString().slice(0, 10);

  // Fields outside Agent Skills/LSS are kept in luci.json so nothing from the original is lost
  const known = new Set([...STANDARD_FIELDS, 'id', 'category', 'author', 'version', 'tags', 'dependencies', 'dependsOn', 'relatedSkills', 'related', 'frameworks', 'lastVerified']);
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !known.has(key)).map(([key, value]) => [key, raw[key] ?? value]));
  if (Object.keys(extra).length) {
    contract.extraFrontmatter = { ...(contract.extraFrontmatter ?? {}), ...extra };
    warnings.push(`Kept non-standard field(s) ${Object.keys(extra).map(k => `"${k}"`).join(', ')} in luci.json (extraFrontmatter).`);
  }
  return { data: out, contract, warnings };
}

// ---------- Splitting oversized skills ----------

const slugify = (text: string) => toSkillName(text) || 'section';

interface Section { heading: string | null; text: string }

/** Split markdown into sections at "## " headings, ignoring headings inside code fences. */
function splitSections(body: string, level = 2): Section[] {
  const marker = `${'#'.repeat(level)} `;
  const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith(marker)) sections.push({ heading: line.slice(marker.length).trim(), lines: [line] });
    else sections[sections.length - 1]?.lines.push(line);
  }
  return sections.map(s => ({ heading: s.heading, text: s.lines.join('\n').trim() })).filter(s => s.text);
}

/** Split long text without headings into paragraph chunks of roughly maxTokens. */
function chunkParagraphs(text: string, maxTokens: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const para of text.split(/\n\s*\n/)) {
    const fences = (para.match(/^\s*(```|~~~)/gm) ?? []).length;
    if (!inFence && current.length && estimateTokens([...current, para].join('\n\n')) > maxTokens) {
      chunks.push(current.join('\n\n'));
      current = [];
    }
    current.push(para);
    if (fences % 2 === 1) inFence = !inFence;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

export interface SplitPlan {
  main: string;
  references: { file: string; title: string; headings: string[]; tokens: number; content: string }[];
  before: number;
  after: number;
}

/**
 * Plan a lossless split of an oversized skill body: keep the opening sections in SKILL.md
 * (up to ~targetTokens), move the rest into references/*.md, and add a list so agents load
 * each part only when the task needs it. Returns null when the body is within the limit.
 */
export function planSplit(content: string, options: { maxTokens?: number; targetTokens?: number; skillName?: string } = {}): SplitPlan | null {
  const maxTokens = options.maxTokens ?? MAX_BODY_TOKENS;
  const target = options.targetTokens ?? SPLIT_TARGET_TOKENS;
  if (estimateTokens(content) <= maxTokens) return null;

  let sections = splitSections(content, 2);
  if (sections.length < 3) sections = splitSections(content, 3);
  if (sections.length < 3) sections = chunkParagraphs(content, target).map((text, i) => ({ heading: i === 0 ? null : `Part ${i + 1}`, text }));

  const keep: Section[] = [];
  const move: Section[] = [];
  let used = 0;
  for (const section of sections) {
    const tokens = estimateTokens(section.text);
    if (move.length === 0 && (keep.length === 0 || used + tokens <= target)) {
      keep.push(section);
      used += tokens;
    } else {
      move.push(section);
    }
  }
  // An opening section that is itself huge: split it into paragraphs
  if (move.length === 0 || used > maxTokens) {
    const chunks = chunkParagraphs(keep.map(s => s.text).join('\n\n'), target);
    keep.length = 0;
    keep.push({ heading: null, text: chunks[0] ?? '' });
    move.unshift(...chunks.slice(1).map((text, i) => ({ heading: `Part ${i + 2}`, text })));
  }

  const groups: { sections: Section[]; tokens: number }[] = [];
  for (const section of move) {
    const tokens = estimateTokens(section.text);
    const current = groups[groups.length - 1];
    if (!current || current.tokens >= GROUP_MIN_TOKENS || current.tokens + tokens > GROUP_MAX_TOKENS) groups.push({ sections: [section], tokens });
    else {
      current.sections.push(section);
      current.tokens += tokens;
    }
  }

  const skillName = options.skillName ?? 'this';
  const usedNames = new Set<string>();
  const references = groups.map((group, i) => {
    const headings = group.sections.map((s, j) => s.heading ?? `Part ${i + j + 2}`);
    const base = slugify(headings[0] ?? 'section');
    let file = `${base}.md`;
    for (let n = 2; usedNames.has(file); n++) file = `${base}-${n}.md`;
    usedNames.add(file);
    const title = headings.length > 3 ? `${headings.slice(0, 3).join('; ')}; …` : headings.join('; ');
    const body = group.sections.map(s => (s.text.startsWith('#') ? s.text : `## ${s.heading ?? 'Continued'}\n\n${s.text}`)).join('\n\n');
    const text = `<!-- Part of the ${skillName} skill, moved here from SKILL.md by ${PRODUCT.name} (content unchanged). Paths below are relative to the skill folder. -->\n\n${body}\n`;
    return { file: `references/${file}`, title, headings, tokens: group.tokens, content: text };
  });

  const index = [
    INDEX_HEADING,
    '',
    `_${PRODUCT.name} moved these sections out of this file to save context; their content is unchanged. Read one only when the task needs it:_`,
    '',
    ...references.map(r => `- [${r.title}](${r.file}) (~${r.tokens} tokens)`)
  ].join('\n');

  const main = `${keep.map(s => s.text).join('\n\n')}\n\n${index}\n`;
  return { main, references, before: estimateTokens(content), after: estimateTokens(main) };
}

/** Apply a split plan to a skill folder (never overwrites existing reference files). */
export function applySplit(dir: string, plan: SplitPlan): void {
  const skill = readSkillFolder(dir);
  for (const ref of plan.references) {
    let target = path.join(dir, ref.file);
    if (fs.existsSync(target)) {
      const ext = path.extname(target);
      let n = 2;
      while (fs.existsSync(`${target.slice(0, -ext.length)}-${n}${ext}`)) n++;
      const renamed = `${ref.file.slice(0, -ext.length)}-${n}${ext}`;
      plan.main = plan.main.replace(`](${ref.file})`, `](${renamed})`);
      target = path.join(dir, renamed);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, ref.content, 'utf8');
  }
  skill.content = plan.main;
  writeSkillFolder(dir, skill);
}
