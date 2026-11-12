import fs from 'node:fs';
import path from 'node:path';
import {
  AGENT_SKILLS_FIELDS,
  CONTRACT_FIELD_TYPES,
  CONTRACT_FILE,
  META,
  PERMISSIONS,
  PRODUCT,
  SKILL_FILE,
  fmMap,
  fmString,
  parseFrontmatter,
  parseSkillContract,
  type SkillContract
} from '@luci/format';
import { LEVEL_NAMES, MAX_KEYWORDS, MAX_KEYWORD_LENGTH, MAX_TAGS, rankabilityLevel } from './rankability.js';

// Keyword stuffing: one word used this many times AND making up this share of the description
const STUFFING_REPEATS = 6;
const STUFFING_SHARE = 0.1;
const STUFFING_IGNORE = new Set(['with', 'that', 'this', 'from', 'your', 'when', 'what', 'into', 'their', 'them', 'they', 'will', 'such', 'also', 'skill', 'skills', 'used', 'using']);

const ALLOWED_FRONTMATTER = new Set<string>(AGENT_SKILLS_FIELDS);
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PLACEHOLDERS = new Set(['>', '>-', '>+', '|', '|-', '|+']);
const MAX_BODY_TOKENS = 5000;
const MAX_BODY_LINES = 500;
/** Project skills load into every task that needs them, so they stay short. */
export const MAX_PROJECT_BODY_TOKENS = 500;
/** Placeholder written by `luci skills new`; a skill can't be published until it's replaced. */
export const NEW_SKILL_TODO = 'TODO:';

const VALID_PERMISSIONS = new Set<string>(PERMISSIONS);

function typeMatches(value: unknown, type: string): boolean {
  if (type === 'string[]') return Array.isArray(value) && value.every(v => typeof v === 'string');
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

/** The body without fenced code blocks, so examples aren't checked as instructions. */
const proseOnly = (body: string) => body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');

/** True when a skill folder sits in a project's memory folder (.luci/skills/<name>). */
export function isProjectSkillDir(dir: string): boolean {
  const parts = path.resolve(dir).split(path.sep);
  return parts.length >= 3 && parts[parts.length - 2] === 'skills' && parts[parts.length - 3] === PRODUCT.projectDir;
}

/** Body problems agents trip over: missing links and files, a second H1, raw LaTeX. */
function lintBody(dir: string, body: string): string[] {
  const warnings: string[] = [];
  const prose = proseOnly(body);

  const broken = new Set<string>();
  for (const m of prose.replace(/`[^`\n]*`/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const link = m[1] ?? '';
    const target = link.split('#')[0] ?? '';
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
    if (!/[./]/.test(target)) continue;
    let decoded = target;
    try { decoded = decodeURIComponent(target); } catch { /* keep as written */ }
    if (!fs.existsSync(path.resolve(dir, decoded))) broken.add(link);
  }
  if (broken.size) warnings.push(`Broken link${broken.size > 1 ? 's' : ''} (file not found): ${[...broken].join(', ')}`);

  // Supporting files the instructions tell the agent to open or run (not destinations in the user's repo)
  const missing = new Set<string>();
  for (const m of prose.matchAll(/(?:^|[\s`(]|(?<!=)['"])(?:\.\/)?((?:references|scripts|assets)\/[\w./-]*\w\.[a-z0-9]+)/gim)) {
    const index = m.index ?? 0;
    const before = prose.slice(Math.max(0, index - 16), index + 1);
    if (/(\bto|\binto|repo's|project's)\s*`?$/i.test(before)) continue;
    const sentence = prose.slice(0, index + 1).split(/[.!?]\s|\n/).pop() ?? '';
    if (/\bcopy\b.*\b(to|into)\b/i.test(sentence)) continue;
    const file = m[1] ?? '';
    if (!fs.existsSync(path.join(dir, file))) missing.add(file);
  }
  if (missing.size) {
    warnings.push(`Mentions file${missing.size > 1 ? 's' : ''} that this skill doesn't include: ${[...missing].slice(0, 6).join(', ')}${missing.size > 6 ? ` (+${missing.size - 6} more)` : ''}`);
  }

  const h1s = prose.split('\n').filter(l => /^# \S/.test(l));
  if (h1s.length > 1) warnings.push(`${h1s.length} top-level (#) headings: keep one title; use ## for sections`);
  if (/\$\\(?:le|ge|leq|geq|times|approx|neq|pm|rightarrow|to)\$/.test(prose)) {
    warnings.push('LaTeX math like $\\le$ shows as raw text in Markdown: use plain characters (≤, ≥, ×, ≈, →)');
  }
  return warnings;
}

export interface LintResult {
  name: string;
  errors: string[];
  warnings: string[];
  level?: number;
  levelName?: string;
  missing?: string[];
}

/** Validate one LSS skill folder. `knownSkills` enables dependsOn checks. */
export function lintSkillFolder(dir: string, knownSkills: ReadonlySet<string> | null = null, options: { maxBodyTokens?: number } = {}): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const folderName = path.basename(dir);
  const skillFile = path.join(dir, SKILL_FILE);
  if (!fs.existsSync(skillFile)) return { name: folderName, errors: ['Missing SKILL.md'], warnings };

  const { data, content, hasFrontmatter } = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
  if (!hasFrontmatter) errors.push('SKILL.md has no frontmatter (--- block)');
  for (const key of Object.keys(data)) {
    if (!ALLOWED_FRONTMATTER.has(key)) errors.push(`Unknown frontmatter field "${key}": put ${PRODUCT.name} data in metadata (luci-*) or ${CONTRACT_FILE}`);
  }

  const name = fmString(data['name']);
  if (!name) errors.push('Missing "name"');
  else {
    if (name.length > 64) errors.push('"name" is longer than 64 characters');
    if (!NAME_PATTERN.test(name)) errors.push('"name" must be lowercase letters, digits and single hyphens');
    if (name !== folderName) errors.push(`"name" (${name}) must match the folder name (${folderName})`);
  }

  const description = fmString(data['description']).trim();
  if (!description) errors.push('Missing "description"');
  else if (PLACEHOLDERS.has(description)) errors.push(`"description" is a placeholder ("${description}")`);
  else if (description.startsWith(NEW_SKILL_TODO)) errors.push('"description" is still the template text: say what the skill does and when to use it');

  if (description) {
    const counts = new Map<string, number>();
    const allWords = description.toLowerCase().match(/[a-z][a-z0-9+#-]*/g) ?? [];
    for (const w of allWords) if (w.length >= 4 && !STUFFING_IGNORE.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const stuffed = [...counts.entries()].filter(([, n]) => n >= STUFFING_REPEATS && n / allWords.length >= STUFFING_SHARE).map(([w]) => w);
    if (stuffed.length) warnings.push(`Description repeats ${stuffed.map(w => `"${w}"`).join(', ')} unusually often. Repetition doesn't improve ranking; list trigger phrases in ${CONTRACT_FILE} keywords instead`);
    if (description.length > 1024) errors.push('"description" is longer than 1024 characters');
    else if (description.length < 20) warnings.push('"description" is very short: say what the skill does and when to use it');
  }

  if (data['compatibility'] !== undefined && String(data['compatibility']).length > 500) errors.push('"compatibility" is longer than 500 characters');

  const metaRaw = data['metadata'];
  if (metaRaw !== undefined) {
    if (typeof metaRaw !== 'object' || Array.isArray(metaRaw)) errors.push('"metadata" must be a map of string keys to string values');
    else {
      for (const [k, v] of Object.entries(metaRaw)) if (typeof v !== 'string') errors.push(`metadata "${k}" must be a string`);
      const tagCount = fmString(metaRaw[META.tags]).split(',').map(t => t.trim()).filter(Boolean).length;
      if (tagCount > MAX_TAGS) errors.push(`metadata ${META.tags} has ${tagCount} tags (max ${MAX_TAGS})`);
      const category = fmString(metaRaw[META.category]);
      const parentFolder = path.basename(path.dirname(dir));
      // Library layout is library/<category>/<name>; project skills sit directly in .luci/skills/
      if (category && parentFolder !== 'skills' && category !== parentFolder) warnings.push(`metadata ${META.category} (${category}) differs from the parent folder (${parentFolder})`);
    }
  }

  if (!data['license']) warnings.push('No "license": state the original author\'s licence');

  const tokens = Math.round(content.length / 4);
  const lines = content.split('\n').length;
  const maxTokens = options.maxBodyTokens ?? (isProjectSkillDir(dir) ? MAX_PROJECT_BODY_TOKENS : MAX_BODY_TOKENS);
  if (tokens > maxTokens) warnings.push(`Body is ~${tokens} tokens (guideline: under ${maxTokens}); move detail into references/`);
  if (lines > MAX_BODY_LINES) warnings.push(`Body is ${lines} lines (guideline: under ${MAX_BODY_LINES})`);
  warnings.push(...lintBody(dir, content));

  const contractFile = path.join(dir, CONTRACT_FILE);
  let contract: SkillContract | null = {};
  if (fs.existsSync(contractFile)) {
    const parsed = parseSkillContract(fs.readFileSync(contractFile, 'utf8'));
    if (!parsed.ok) {
      errors.push(parsed.error);
      contract = null;
    } else {
      contract = parsed.value;
      if (Array.isArray(contract.keywords)) {
        if (contract.keywords.length > MAX_KEYWORDS) errors.push(`${CONTRACT_FILE}: ${contract.keywords.length} keywords (max ${MAX_KEYWORDS})`);
        const long = contract.keywords.filter(k => String(k).length > MAX_KEYWORD_LENGTH);
        if (long.length) errors.push(`${CONTRACT_FILE}: keywords longer than ${MAX_KEYWORD_LENGTH} characters: ${long.map(k => `"${String(k).slice(0, 20)}…"`).join(', ')}`);
      }
      for (const [key, value] of Object.entries(contract)) {
        const type = CONTRACT_FIELD_TYPES[key];
        if (!type) warnings.push(`${CONTRACT_FILE}: unknown field "${key}"`);
        else if (!typeMatches(value, type)) errors.push(`${CONTRACT_FILE}: "${key}" must be ${type}`);
      }
      for (const dep of contract.dependsOn ?? []) if (knownSkills && !knownSkills.has(dep)) errors.push(`${CONTRACT_FILE}: dependsOn "${dep}" is not a known skill`);
      for (const p of contract.permissions ?? []) if (!VALID_PERMISSIONS.has(p)) warnings.push(`${CONTRACT_FILE}: unknown permission "${p}"`);
      const src = contract.source;
      if (src && (src.licenseStatus === 'unknown' || src.licenseStatus === 'restricted')) {
        warnings.push(`Licence ${src.licenseStatus === 'unknown' ? 'not found' : 'is restricted'} at the source (${src.licenseUrl ?? src.repo}): get the author's permission before redistributing`);
      } else if (src && src.licenseVerified === false) {
        warnings.push(`Licence not yet verified against the original source: run ${PRODUCT.command} skills licenses`);
      }
    }
  }

  const meta = fmMap(data['metadata']);
  const rank = rankabilityLevel({
    id: name || folderName,
    name: fmString(meta[META.title]) || name,
    description,
    tags: fmString(meta[META.tags]).split(',').map(t => t.trim()).filter(Boolean),
    contract: contract ?? {}
  }, errors.length);

  return { name: name || folderName, errors, warnings, level: rank.level, levelName: rank.name, missing: rank.missing };
}

/** Every LSS skill folder under a directory. */
export function findSkillFolders(root: string): string[] {
  const folders: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.isFile() && e.name === SKILL_FILE)) {
      folders.push(dir);
      return;
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name));
  };
  walk(root);
  return folders.sort();
}

export interface LibraryLint {
  results: (LintResult & { dir: string })[];
  levels: { level: number; name: string; count: number }[];
  errorCount: number;
  warningCount: number;
}

/** Lint every skill under `root` (or one skill folder), including duplicate names and descriptions. */
export function lintLibrary(root: string): LibraryLint {
  const folders = fs.existsSync(path.join(root, SKILL_FILE)) ? [root] : findSkillFolders(root);
  const names = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();
  for (const dir of folders) {
    const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, SKILL_FILE), 'utf8'));
    const name = fmString(data['name']) || path.basename(dir);
    names.set(name, [...(names.get(name) ?? []), dir]);
    const key = fmString(data['description']).toLowerCase().replace(/\W+/g, ' ').trim();
    if (key.length >= 40) byDescription.set(key, [...(byDescription.get(key) ?? []), dir]);
  }
  const known = new Set(names.keys());
  const results = folders.map(dir => ({ dir, ...lintSkillFolder(dir, known) }));
  for (const [name, dirs] of names) {
    if (dirs.length < 2) continue;
    for (const r of results.filter(res => dirs.includes(res.dir))) r.errors.push(`Duplicate skill name "${name}" (${dirs.length} folders)`);
  }
  for (const dirs of byDescription.values()) {
    if (dirs.length < 2) continue;
    for (const r of results.filter(res => dirs.includes(res.dir))) r.warnings.push(`Same description as ${dirs.filter(d => d !== r.dir).map(d => path.basename(d)).join(', ')}`);
  }
  return {
    results,
    levels: LEVEL_NAMES.map((name, level) => ({ level, name, count: results.filter(r => r.level === level).length })),
    errorCount: results.reduce((n, r) => n + r.errors.length, 0),
    warningCount: results.reduce((n, r) => n + r.warnings.length, 0)
  };
}
