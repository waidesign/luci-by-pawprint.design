/**
 * Turn any skill into an LSS skill: from a GitHub link, a local skill folder, or a
 * single markdown file. Used by `luci skills add` (S9).
 *
 *   const prepared = await prepareSkill(source)   // read + inspect, writes nothing
 *   const preview  = previewSkill(prepared, opts) // what will be written
 *   await installSkill(prepared, preview)         // write folder, licence, split
 */
import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT_FILE, META, SKILL_FILE, fmString, parseFrontmatter, parseSkillContract, type FrontmatterMap, type SkillContract } from '@luci-dev/format';
import { parseGitHubUrl, type GitHubClient } from './github.js';
import { licenseCategory, normalizeLicense, resolveSkillLicense } from './licenses.js';
import { applySplit, canModify, convertToLss, planSplit, toSkillName, writeSkillFolder, type LicenseResult, type SplitPlan } from './lss.js';
import { enrichContract, rankabilityLevel } from './rankability.js';

export const SUPPORT_LIMITS = { maxFileBytes: 512 * 1024, maxFiles: 300, maxTotalBytes: 10 * 1024 * 1024 };
const DOWNLOAD_CONCURRENCY = 8;
const SKIP_PARTS = (rel: string) => rel.split('/').some(seg => seg === '..' || seg.startsWith('.') || seg === 'node_modules');

/** Pick a library category from whole words (no substring guesses like "aria" in "variables"). */
export function guessCategory(text: string): string {
  const words = new Set(String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const has = (...terms: string[]) => terms.some(t => (t.endsWith('*') ? [...words].some(w => w.startsWith(t.slice(0, -1))) : words.has(t)));

  if (has('docx', 'pptx', 'xlsx', 'pdf', 'spreadsheet', 'powerpoint')) return 'documents';
  if (has('video', 'remotion', 'hyperframes', 'audio', 'music', 'image', 'images')) return 'media-creative';
  if (has('azure', 'aks', 'kubernetes', 'cloud', 'deploy*', 'docker', 'infra*', 'vercel')) return 'cloud-infra';
  if (has('postgres', 'database', 'supabase', 'sql', 'prisma')) return 'database';
  if (has('accessibility', 'accessible', 'wcag', 'aria', 'a11y')) return 'accessibility';
  if (has('tokens', 'shadcn', 'radix') || (has('design') && has('system', 'systems'))) return 'design-systems';
  if (has('animation*', 'motion', 'framer', 'animejs')) return 'animation-motion';
  if (has('test', 'tests', 'testing', 'tdd', 'vitest', 'jest', 'playwright', 'cypress')) return 'testing';
  if (has('debug*', 'bug', 'bugs', 'diagnos*', 'troubleshoot*')) return 'debugging';
  if (has('lint', 'linting', 'guardrail*', 'pre-commit') || (has('code') && has('review'))) return 'code-quality';
  if (has('architecture', 'architect', 'spec', 'tickets')) return 'architecture';
  if (has('react', 'nextjs', 'vue', 'svelte', 'tailwind', 'css', 'frontend')) return 'frontend';
  if (has('ui', 'ux', 'landing', 'layout', 'website', 'mobile')) return 'ui-ux';
  if (has('agent', 'agents', 'handoff', 'workflow', 'triage', 'prompt')) return 'workflow';
  return 'general';
}

export interface SupportFile {
  rel: string;
  size: number;
  remote?: string;
  local?: string;
}

export interface PreparedSkill {
  origin: string;
  data: FrontmatterMap;
  raw: Record<string, string>;
  content: string;
  existingContract?: SkillContract | null;
  nameHint: string;
  source: { repo: string; path: string } | null;
  license: LicenseResult;
  files: SupportFile[];
  readFile: (f: SupportFile) => Promise<Buffer | string | null> | Buffer | string | null;
}

/** What a skill can do beyond giving instructions: "shell" when it ships hooks, shell tools or scripts. */
export function detectPermissions(prepared: Pick<PreparedSkill, 'existingContract' | 'data' | 'files'>): string[] {
  const permissions = new Set(prepared.existingContract?.permissions ?? []);
  const tools = fmString(prepared.data['allowed-tools']);
  const hasScripts = prepared.files.some(f => /^scripts\//.test(f.rel) || /\.(sh|ps1|bat|py|mjs|cjs|js|ts)$/.test(f.rel));
  if (prepared.data['hooks'] || /\bBash\b|\bshell\b/i.test(tools) || hasScripts) permissions.add('shell');
  return [...permissions];
}

/** Which supporting files to bring along, within size and count limits. */
function selectSupportFiles(files: readonly SupportFile[], limits = SUPPORT_LIMITS) {
  const selected: SupportFile[] = [];
  let total = 0;
  let skipped = 0;
  for (const f of files) {
    if (SKIP_PARTS(f.rel) || f.size > limits.maxFileBytes) { skipped++; continue; }
    if (selected.length >= limits.maxFiles || total + f.size > limits.maxTotalBytes) { skipped++; continue; }
    selected.push(f);
    total += f.size;
  }
  return { selected, skipped, totalBytes: total };
}

async function readFromGitHub(github: GitHubClient, ref: { repo: string; branch?: string | null; path: string }): Promise<PreparedSkill> {
  const tree = await github.tree(ref.repo, ref.branch);
  if (!tree) throw new Error(`Could not read ${ref.repo} on GitHub (missing, private, or rate limited).`);
  const skillFiles = tree.blobs.filter(b => b.path === SKILL_FILE || b.path.endsWith(`/${SKILL_FILE}`));

  let blob;
  if (ref.path) blob = skillFiles.find(b => b.path === `${ref.path}/${SKILL_FILE}`);
  else if (skillFiles.length === 1) blob = skillFiles[0];
  else blob = skillFiles.find(b => b.path === SKILL_FILE);
  if (!blob) {
    const options = skillFiles.slice(0, 15).map(b => `  https://github.com/${ref.repo}/tree/${tree.branch}/${b.path.replace(/\/?SKILL\.md$/, '')}`);
    throw new Error(skillFiles.length
      ? `${ref.repo} has ${skillFiles.length} skills. Add one of them:\n${options.join('\n')}`
      : `No SKILL.md found in ${ref.repo}${ref.path ? `/${ref.path}` : ''}.`);
  }

  const dir = blob.path.includes('/') ? blob.path.slice(0, blob.path.lastIndexOf('/')) : '';
  const text = await github.raw(ref.repo, tree.branch, blob.path);
  if (text === null) throw new Error(`Could not download ${blob.path} from ${ref.repo}.`);
  const { data, content, raw } = parseFrontmatter(text);
  // Only files inside the skill's own folder (a repo-root skill brings no extras)
  const files = dir
    ? tree.blobs.filter(b => b.path.startsWith(`${dir}/`) && b.path !== blob.path).map(b => ({ rel: b.path.slice(dir.length + 1), size: b.size, remote: b.path }))
    : [];
  const license = await resolveSkillLicense(github, { repo: ref.repo, path: blob.path }, data);
  return {
    origin: `https://github.com/${ref.repo}/tree/${tree.branch}/${dir}`,
    data,
    raw,
    content,
    nameHint: dir ? dir.split('/').pop() ?? ref.repo : ref.repo.split('/')[1] ?? ref.repo,
    source: { repo: ref.repo, path: blob.path },
    license,
    files,
    readFile: (f) => github.raw(ref.repo, tree.branch, f.remote ?? f.rel, { binary: true })
  };
}

function readFromLocal(target: string): PreparedSkill {
  const full = path.resolve(target);
  if (!fs.existsSync(full)) throw new Error(`Not found: ${target}`);
  let skillFile = full;
  let dir: string | null = null;
  if (fs.statSync(full).isDirectory()) {
    skillFile = path.join(full, SKILL_FILE);
    if (!fs.existsSync(skillFile)) throw new Error(`No SKILL.md in ${target}. Point to a skill folder or a .md file.`);
    dir = full;
  } else if (!full.endsWith('.md')) {
    throw new Error('Skills are markdown: point to a .md file or a folder containing SKILL.md.');
  }

  const { data, content, raw } = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
  let existingContract: SkillContract | null = null;
  const files: SupportFile[] = [];
  if (dir) {
    const contractFile = path.join(dir, CONTRACT_FILE);
    if (fs.existsSync(contractFile)) {
      const parsed = parseSkillContract(fs.readFileSync(contractFile, 'utf8'));
      if (parsed.ok) existingContract = parsed.value; // an invalid contract is rebuilt
    }
    const base = dir;
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        const rel = path.relative(base, p).replace(/\\/g, '/');
        if (e.isDirectory()) walk(p);
        else if (rel !== SKILL_FILE && rel !== CONTRACT_FILE) files.push({ rel, size: fs.statSync(p).size, local: p });
      }
    };
    walk(dir);
  }

  const spdx = normalizeLicense(data['license']);
  const declaredName = fmString(data['name']);
  return {
    origin: full,
    data,
    raw,
    content,
    existingContract,
    // A folder's name is the skill name (Agent Skills rule); a lone file uses its declared name
    nameHint: dir ? path.basename(dir) : (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(declaredName) ? declaredName : path.basename(full, '.md')),
    source: null,
    license: { spdx, category: licenseCategory(spdx), evidence: spdx ? 'declared in the skill' : 'no license declared', url: null },
    files,
    readFile: (f) => (f.local ? fs.readFileSync(f.local) : null)
  };
}

/** Read and inspect a skill from a GitHub link, folder or .md file. Writes nothing. */
export async function prepareSkill(target: string, options: { github?: GitHubClient } = {}): Promise<PreparedSkill> {
  const ref = parseGitHubUrl(target);
  if (ref) {
    if (!options.github) throw new Error('A GitHub client is required for GitHub links.');
    return readFromGitHub(options.github, ref);
  }
  return readFromLocal(target);
}

export interface PreviewOptions {
  root: string;
  category?: string;
  name?: string;
  flat?: boolean;
  /** Author-supplied when-to-use (counts as written by the author). */
  when?: string;
}

export interface SkillPreview {
  name: string;
  category: string;
  categorySource: 'chosen' | 'from the skill' | 'guessed';
  level: number;
  levelName: string;
  levelMissing: string[];
  dir: string;
  data: Record<string, unknown>;
  contract: SkillContract;
  content: string;
  support: ReturnType<typeof selectSupportFiles>;
  split: SplitPlan | null;
  oversizedNotSplit: boolean;
  warnings: string[];
}

/** Work out exactly what will be written: frontmatter, contract, folder, files, and whether it is split. */
export function previewSkill(prepared: PreparedSkill, options: PreviewOptions): SkillPreview {
  const declared = fmString(prepared.data['category']) || fmString((prepared.data['metadata'] as FrontmatterMap | undefined)?.[META.category]);
  const category = options.category || declared || guessCategory(`${prepared.nameHint} ${fmString(prepared.data['name'])} ${fmString(prepared.data['description'])}`);
  if (!/^[a-z0-9-]+$/i.test(category)) {
    throw new Error(`Category "${category}" contains invalid characters. Use letters, numbers, and hyphens only.`);
  }
  const categorySource = options.category ? 'chosen' : declared ? 'from the skill' : 'guessed';
  const nameHint = options.name ?? prepared.nameHint;
  const data = options.name ? { ...prepared.data, name: toSkillName(options.name) } : prepared.data;
  if (options.name) delete (data as Record<string, unknown>)['id'];
  const converted = convertToLss({ data, content: prepared.content, nameHint, category, existingContract: prepared.existingContract ?? null, raw: prepared.raw });

  const { license } = prepared;
  converted.data['license'] = license.spdx ?? (converted.data['license'] as string | undefined) ?? 'UNKNOWN';
  if (prepared.source) {
    converted.contract.source = {
      ...prepared.source,
      licenseVerified: Boolean(license.spdx),
      licenseStatus: license.category,
      licenseEvidence: license.evidence,
      licenseUrl: license.url,
      licenseCheckedAt: new Date().toISOString().slice(0, 10)
    };
  }

  const permissions = detectPermissions(prepared);
  if (permissions.length) converted.contract.permissions = permissions;
  if (options.when) converted.contract.whenToUse = [String(options.when)];

  // Fill ranking fields from the skill's own text, then grade it
  const meta = converted.data.metadata;
  const asSkill = {
    id: converted.data.name,
    name: meta[META.title] || converted.data.name,
    description: converted.data.description,
    category,
    tags: (meta[META.tags] ?? '').split(',').map(t => t.trim()).filter(Boolean),
    content: prepared.content,
    contract: converted.contract
  };
  converted.contract = enrichContract(asSkill).contract;
  const rank = rankabilityLevel({ ...asSkill, contract: converted.contract });

  const name = converted.data.name;
  const dir = options.flat ? path.join(options.root, name) : path.join(options.root, category, name);
  const support = selectSupportFiles(prepared.files);
  const plan = planSplit(prepared.content, { skillName: name });
  // Restructuring someone else's skill needs a licence that allows changes
  const mayModify = canModify(license.category);

  const warnings = [...converted.warnings];
  if (license.category === 'unknown') warnings.push(`No licence found${prepared.source ? ' at the source' : ''}: get the author's permission before sharing this skill.`);
  if (license.category === 'restricted') warnings.push('The licence is restricted: this skill may not be redistributed without permission.');
  if (permissions.includes('shell')) warnings.push('This skill can run commands on your computer (hooks or scripts). Review them before use.');
  if (support.skipped) warnings.push(`${support.skipped} supporting file(s) were not copied (hidden, too large, or over the limit of ${SUPPORT_LIMITS.maxFiles} files / ${SUPPORT_LIMITS.maxTotalBytes / 1024 / 1024} MB).`);
  if (plan && !mayModify) warnings.push(`The skill is ~${plan.before} tokens (over the 5000 guideline) but its licence doesn't clearly allow changes, so it was not split.`);

  return {
    name,
    category,
    categorySource,
    level: rank.level,
    levelName: rank.name,
    levelMissing: rank.missing,
    dir,
    data: converted.data,
    contract: converted.contract,
    content: prepared.content,
    support,
    split: plan && mayModify ? plan : null,
    oversizedNotSplit: Boolean(plan && !mayModify),
    warnings
  };
}

async function runPool<T>(items: readonly T[], worker: (item: T) => Promise<void>, size: number): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await worker(item);
    }
  }));
}

/** Write the previewed skill to disk: supporting files, SKILL.md, luci.json, then the split. */
export async function installSkill(prepared: PreparedSkill, preview: SkillPreview): Promise<{ dir: string; copied: number }> {
  let copied = 0;
  await runPool(preview.support.selected, async (file) => {
    const bytes = await prepared.readFile(file);
    if (bytes === null || bytes === undefined) return;
    const dest = path.join(preview.dir, file.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    copied++;
  }, DOWNLOAD_CONCURRENCY);

  writeSkillFolder(preview.dir, { data: preview.data, content: preview.content, contract: preview.contract });
  if (preview.split) applySplit(preview.dir, preview.split);
  return { dir: preview.dir, copied };
}
