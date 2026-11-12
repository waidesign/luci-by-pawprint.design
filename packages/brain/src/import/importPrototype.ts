/**
 * `luci import` (B13): move a project set up with the earlier prototype onto Luci.
 * This is the one place in Luci that reads the prototype's names and layout (PROTOTYPE below).
 *
 *   ai-brain/                 -> .luci/
 *     context, rules, playbook, README: merged into Luci's templates section by section.
 *       A section that still matches the template gets Luci's text; a section someone
 *       edited is kept, with old paths and commands renamed.
 *     decisions/, memory/proposed/: copied word for word (they are history)
 *     skills/ (gaw.json)      -> .luci/skills/ (luci.json, luci-* keys)
 *     skills.lock.json        -> converted; selected skills not in Luci's library are reported
 *     local/                  -> active task (renamed paths) and archive copied; summaries regenerated
 *     brain.json, project-skills.md: generated again
 *   ~/.gaw/brain              -> files missing from (or unchanged defaults in) ~/.luci/brain
 *   Agent files               -> the old section is replaced by Luci's; the rest of each file is kept
 *
 * Nothing is deleted: ai-brain/ stays until the user removes it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_END_MARKER,
  LSS_VERSION,
  MEMORY_FILES,
  PRODUCT,
  SKILL_FILE,
  TEMPLATE_DIRS,
  agentStartMarker,
  stripBom,
  type AgentId,
  type LockEntry
} from '@luci/format';
import { SkillRegistry, writeCatalog, writeLock, type SkillSource } from '@luci/skills';
import { agentBlock } from '../agents/agentBlock.js';
import { configureAgent } from '../agents/agentFiles.js';
import { detectProject } from '../detect/detector.js';
import { TEMPLATES_DIR, memoryDir, memoryPath, projectFacts, renderTemplateFile } from '../layout/brainLayout.js';
import { writeBrain } from '../layout/writeBrain.js';
import { writeGlobalBrainSnapshot } from '../memory/globalLink.js';
import { MemoryEngine } from '../memory/memoryEngine.js';
import { DEFAULT_BRAIN_DIR } from '../memory/paths.js';

/** The prototype's names. Only this file may use them. */
export const PROTOTYPE = {
  projectDir: 'ai-brain',
  homeDir: '.gaw',
  homeEnv: 'GAW_HOME',
  contractFile: 'gaw.json',
  metaPrefix: 'gaw-',
  lockKey: 'gss',
  command: 'gaw',
  author: 'GAW',
  markerStart: /<!-- (?:GUIDED AGENT WORKFLOW|GAW) — (.+?) (?:CONFIGURATION|INSTRUCTIONS) -->/,
  markerEnd: /<!-- END (?:GUIDED AGENT WORKFLOW|GAW) -->/,
  oldGoalHeading: '## Product Overview',
  oldGoalPlaceholder: 'Add an overview of what the application does',
  /** Agent files the prototype wrote. */
  agentFiles: ['CLAUDE.md', '.cursorrules', 'AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md', '.windsurfrules']
} as const;

const MERGED_FILES = ['context.md', 'rules.md', 'playbook.md', 'README.md'] as const;
/** Generated in the old layout; Luci writes its own. */
const GENERATED = new Set(['brain.json', 'project-skills.md', 'skills.lock.json', 'index.json']);
/** Task files of the prototype's first layout: archived, never deleted. */
const OLD_TASK_FILES = new Set(['active-skills.md', 'ACTIVE_TASK.md']);
const LUCI_AGENTS: Readonly<Record<string, AgentId>> = { 'CLAUDE CODE': 'claudeCode', CURSOR: 'cursor' };
const AGENT_LABELS: Readonly<Record<string, string>> = { CODEX: 'Codex', 'GEMINI CLI': 'Gemini CLI', 'GITHUB COPILOT': 'GitHub Copilot', WINDSURF: 'Windsurf' };

/** Rename the prototype's paths, variables and commands in text people wrote. Prose words are left alone. */
export function renameText(text: string): string {
  return text
    .replace(/(?<![\w.-])ai-brain(?![\w-])/g, PRODUCT.projectDir)
    .replace(/~\/\.gaw(?![\w-])/g, `~/${PRODUCT.homeDir}`)
    .replace(/\bGAW_HOME\b/g, PRODUCT.homeEnv)
    .replace(/\bgaw\.json\b/g, 'luci.json')
    .replace(/`gaw(?=[\s`])/g, `\`${PRODUCT.command}`);
}

interface Parsed {
  preamble: string;
  sections: { heading: string; body: string }[];
}

function parseSections(text: string): Parsed {
  const lines = stripBom(text).replace(/\r\n/g, '\n').split('\n');
  const first = lines.findIndex(l => l.startsWith('## '));
  const preamble = (first === -1 ? lines : lines.slice(0, first)).join('\n').trim();
  const sections: Parsed['sections'] = [];
  if (first !== -1) {
    let current: { heading: string; body: string[] } | null = null;
    for (const line of lines.slice(first)) {
      if (line.startsWith('## ')) {
        if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() });
        current = { heading: line.trim(), body: [] };
      } else current?.body.push(line);
    }
    if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() });
  }
  return { preamble, sections };
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What each {{PLACEHOLDER}} can expand to. Most are one line; the protected paths list is
// always exactly these three generated lines, so a line a person added there is never matched away.
const PLACEHOLDER_PATTERNS: Readonly<Record<string, string>> = {
  PROTECTED_PATHS: '  - Lockfiles[^\\n]*\\n  - Generated output:[^\\n]*\\n  - Secrets:[^\\n]*'
};

/**
 * True when `content` is the template text with only its {{PLACEHOLDERS}} filled in and its
 * optional `<!-- if:x -->` blocks either kept or left out.
 */
export function matchesTemplate(content: string, template: string): boolean {
  const variants = [
    template.replace(/<!-- if:(\w+) -->\n?[\s\S]*?<!-- endif:\1 -->\n?/g, ''),
    template.replace(/<!-- (?:end)?if:\w+ -->\n?/g, '')
  ];
  const actual = normalize(content);
  return variants.some(v => {
    const parts = normalize(v).split(/\{\{([A-Z_]+)\}\}/);
    const pattern = parts.map((p, i) => (i % 2 ? PLACEHOLDER_PATTERNS[p] ?? '[^\\n]*' : escapeRe(p))).join('');
    return new RegExp(`^${pattern}$`).test(actual);
  });
}

/** What the prototype shipped (templates and Global Brain defaults), read only by import. */
export const IMPORT_SNAPSHOT_DIR = fileURLToPath(new URL('../../import-snapshot/', import.meta.url));
const snapshot = (rel: string) => {
  const file = path.join(IMPORT_SNAPSHOT_DIR, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/**
 * Merge an old memory file into Luci's template, section by section. Auto-detected
 * sections and sections that still match the template get Luci's text; edited sections
 * (and sections the template does not have) are kept. Returns the headings kept.
 */
export function mergeIntoTemplate(oldText: string, fresh: string, templateSource: string, prototypeSource: string | null = null): { content: string; kept: string[] } {
  const old = parseSections(renameText(oldText));
  const next = parseSections(fresh);
  const tpl = parseSections(templateSource);
  // The prototype's template, renamed like the old file, so the two compare like for like
  const proto = prototypeSource ? parseSections(renameText(prototypeSource)) : { preamble: '', sections: [] };
  const tplBody = new Map(tpl.sections.map(s => [s.heading, s.body]));
  const protoBody = new Map(proto.sections.map(s => [s.heading === PROTOTYPE.oldGoalHeading ? '## Project Goal' : s.heading, s.body]));
  const fromTemplate = (body: string, heading: string, fallback: string) =>
    matchesTemplate(body, tplBody.get(heading) ?? fallback) || (protoBody.has(heading) && matchesTemplate(body, protoBody.get(heading)!));
  const oldBy = new Map(old.sections.map(s => [s.heading === PROTOTYPE.oldGoalHeading ? '## Project Goal' : s.heading, s]));
  const kept: string[] = [];
  const used = new Set<string>();
  const isPlaceholder = (body: string) => !body || body.startsWith('_Not written yet') || body.startsWith(PROTOTYPE.oldGoalPlaceholder);

  const out: { heading: string; body: string }[] = [];
  for (const section of next.sections) {
    const confirmed = section.heading.endsWith(' (auto-detected)') ? section.heading.replace(/ \(auto-detected\)$/, ' (confirmed)') : null;
    if (confirmed && oldBy.has(confirmed)) {
      out.push(oldBy.get(confirmed)!);
      used.add(confirmed);
      kept.push(confirmed.slice(3));
      continue;
    }
    const before = oldBy.get(section.heading);
    if (before) used.add(section.heading);
    const untouched = !before || confirmed || isPlaceholder(before.body) || fromTemplate(before.body, section.heading, section.body);
    if (untouched) out.push(section);
    else {
      out.push({ heading: section.heading, body: before.body });
      kept.push(section.heading.slice(3));
    }
  }
  for (const s of old.sections) {
    const key = s.heading === PROTOTYPE.oldGoalHeading ? '## Project Goal' : s.heading;
    // A section only the prototype's template had, left as it shipped, is dropped
    if (!used.has(key) && !next.sections.some(n => n.heading === key) && !(protoBody.has(key) && matchesTemplate(s.body, protoBody.get(key)!))) {
      out.push(s);
      kept.push(s.heading.slice(3));
    }
  }
  const preambleFromTemplate = !old.preamble || matchesTemplate(old.preamble, tpl.preamble) || (proto.preamble !== '' && matchesTemplate(old.preamble, proto.preamble));
  const preamble = preambleFromTemplate ? next.preamble : old.preamble;
  if (preamble !== next.preamble) kept.unshift('(introduction)');
  return { content: `${preamble}\n\n${out.map(s => `${s.heading}\n${s.body}`.trimEnd()).join('\n\n')}\n`, kept };
}

/** Convert a prototype skill folder's files to the Luci Skill Standard. Returns relative path -> content. */
export function convertSkillFiles(files: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rel, text] of Object.entries(files)) {
    if (rel === PROTOTYPE.contractFile) {
      try {
        const { [PROTOTYPE.lockKey]: _old, ...rest } = JSON.parse(stripBom(text)) as Record<string, unknown>;
        out['luci.json'] = `${JSON.stringify({ lss: LSS_VERSION, ...rest }, null, 2)}\n`;
      } catch {
        out['luci.json'] = text;
      }
    } else if (rel === SKILL_FILE) {
      const normalized = stripBom(text).replace(/\r\n/g, '\n');
      const fm = /^---\n([\s\S]*?)\n---\n/.exec(normalized);
      const head = fm
        ? `---\n${fm[1]!.replace(new RegExp(`^(\\s*)${PROTOTYPE.metaPrefix}`, 'gm'), '$1luci-').replace(new RegExp(`^(\\s*luci-author:\\s*)"?${PROTOTYPE.author}"?\\s*$`, 'm'), `$1"${PRODUCT.name}"`)}\n---\n`
        : '';
      out[SKILL_FILE] = head + renameText(fm ? normalized.slice(fm[0].length) : normalized);
    } else {
      out[rel] = rel.endsWith('.md') ? renameText(text) : text;
    }
  }
  return out;
}

/**
 * A skill folder in the prototype's format (it has the prototype's contract file), converted to the
 * Luci Skill Standard as relative path -> content. Null for any other folder. Used by `luci skills add`.
 */
export function convertPrototypeSkillFolder(dir: string): Record<string, string> | null {
  if (!fs.existsSync(path.join(dir, PROTOTYPE.contractFile)) || !fs.existsSync(path.join(dir, SKILL_FILE))) return null;
  return convertSkillFiles(readTree(dir));
}

const sameJson = (a: string, b: string) => {
  try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return a.trim() === b.trim(); }
};

function readTree(dir: string, base = dir): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, readTree(full, base));
    else out[path.relative(base, full).replace(/\\/g, '/')] = fs.readFileSync(full, 'utf8');
  }
  return out;
}

export interface ImportOptions {
  dryRun?: boolean;
  /** The prototype's home folder (default GAW_HOME or ~/.gaw). */
  prototypeHome?: string;
  /** The user's Luci Global Brain (default ~/.luci/brain). */
  globalBrainDir?: string;
  registry?: SkillSource;
  version?: string;
}

export interface ImportReport {
  projectPath: string;
  dryRun: boolean;
  /** Set when import cannot run here, with the reason. */
  blocked: string | null;
  /** Memory files merged into Luci's templates, with the sections kept from the old file. */
  merged: { file: string; kept: string[] }[];
  /** Files copied from the old folder (decisions, proposals, other notes). */
  copied: string[];
  skills: { kept: string[]; replacedByLuci: string[] };
  lock: { skills: number; notInLibrary: string[] };
  agentFiles: { file: string; action: string }[];
  globalBrain: { from: string | null; copied: string[]; keptYours: string[] };
  next: string[];
}

/** Import a prototype project into Luci's layout. With dryRun nothing is written. */
export async function importPrototype(projectDir: string = process.cwd(), options: ImportOptions = {}): Promise<ImportReport> {
  const dir = path.resolve(projectDir);
  const dryRun = Boolean(options.dryRun);
  const oldDir = path.join(dir, PROTOTYPE.projectDir);
  const report: ImportReport = {
    projectPath: dir, dryRun, blocked: null, merged: [], copied: [], skills: { kept: [], replacedByLuci: [] },
    lock: { skills: 0, notInLibrary: [] }, agentFiles: [], globalBrain: { from: null, copied: [], keptYours: [] }, next: []
  };
  if (!fs.existsSync(oldDir)) { report.blocked = `No ${PROTOTYPE.projectDir}/ folder here, so there is nothing to import. Use \`${PRODUCT.command} init\` for a new project.`; return report; }
  if (fs.existsSync(memoryDir(dir))) { report.blocked = `This project already has ${PRODUCT.projectDir}/. Import runs once, into a project without it.`; return report; }

  const info = detectProject(dir);
  const facts = projectFacts(info, dir);
  const registry = options.registry ?? new SkillRegistry({ user: true });
  const writes = new Map<string, string>(); // project-relative path -> content
  const put = (rel: string, content: string) => writes.set(rel, content);
  const old = readTree(oldDir);

  // Memory files: merged into Luci's templates
  for (const file of MERGED_FILES) {
    const text = old[file];
    const fresh = renderTemplateFile(file, facts);
    if (text === undefined || fresh === null) continue;
    const merged = mergeIntoTemplate(text, fresh, fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'), snapshot(`templates/${file}`));
    put(memoryPath(file), merged.content);
    report.merged.push({ file: memoryPath(file), kept: merged.kept });
  }

  // Skills: converted; a starter nobody changed is replaced by Luci's own copy
  const oldSkills = new Set(Object.keys(old).filter(f => f.startsWith(`${MEMORY_FILES.skills}/`)).map(f => f.split('/')[1]!));
  for (const id of [...oldSkills].sort()) {
    const prefix = `${MEMORY_FILES.skills}/${id}/`;
    const files = Object.fromEntries(Object.entries(old).filter(([f]) => f.startsWith(prefix)).map(([f, t]) => [f.slice(prefix.length), t]));
    if (!files[SKILL_FILE]) continue;
    const converted = convertSkillFiles(files);
    const starter = readTree(path.join(TEMPLATES_DIR, MEMORY_FILES.skills, id));
    const isStarter = Object.keys(starter).length > 0
      && normalize(converted[SKILL_FILE] ?? '') === normalize(starter[SKILL_FILE] ?? '')
      && sameJson(converted['luci.json'] ?? '{}', starter['luci.json'] ?? '{}');
    if (isStarter) { report.skills.replacedByLuci.push(id); continue; }
    for (const [rel, text] of Object.entries(converted)) put(memoryPath(`${prefix}${rel}`), text);
    report.skills.kept.push(id);
  }

  // The skill selection
  let lockEntries: LockEntry[] = [];
  const oldLock = old[MEMORY_FILES.skillsLock];
  if (oldLock !== undefined) {
    try {
      const parsed = JSON.parse(stripBom(oldLock)) as { skills?: unknown };
      lockEntries = (Array.isArray(parsed.skills) ? parsed.skills : []).filter((s): s is LockEntry => Boolean(s && typeof s === 'object' && typeof (s as LockEntry).id === 'string'));
    } catch {
      report.next.push(`${PROTOTYPE.projectDir}/${MEMORY_FILES.skillsLock} was not valid JSON, so no library skills were carried over.`);
    }
  }
  report.lock.skills = lockEntries.length;
  for (const e of lockEntries) if (!(await registry.getSkill(e.id))) report.lock.notInLibrary.push(e.id);

  // History, proposals, notes and private files: copied
  for (const [rel, text] of Object.entries(old)) {
    const top = rel.split('/')[0]!;
    if (MERGED_FILES.includes(rel as (typeof MERGED_FILES)[number]) || GENERATED.has(rel) || top === MEMORY_FILES.skills) continue;
    if (TEMPLATE_DIRS.some(d => rel === `${d}/README.md`)) continue; // Luci writes its own folder READMEs
    if (rel === 'global-brain.md' || rel === MEMORY_FILES.globalBrainSummary || rel === `${MEMORY_FILES.local}/.gitignore`) continue; // regenerated
    if (OLD_TASK_FILES.has(rel)) { put(memoryPath(`${MEMORY_FILES.taskArchive}/${rel.toLowerCase()}`), text); report.copied.push(memoryPath(`${MEMORY_FILES.taskArchive}/${rel.toLowerCase()}`)); continue; }
    // The active task points at files by path, so its paths are renamed; everything else is copied word for word
    put(memoryPath(rel), rel === MEMORY_FILES.activeTask ? renameText(text) : text);
    report.copied.push(memoryPath(rel));
  }

  // Global Brain: carry over preferences the user kept in the prototype's home folder
  const protoHome = options.prototypeHome ?? process.env[PROTOTYPE.homeEnv] ?? path.join(os.homedir(), PROTOTYPE.homeDir);
  const protoBrain = path.join(protoHome, 'brain');
  const memory = new MemoryEngine(options.globalBrainDir ? { globalBrainDir: options.globalBrainDir } : {});
  const globalWrites = new Map<string, string>();
  if (fs.existsSync(protoBrain)) {
    report.globalBrain.from = protoBrain;
    for (const file of fs.readdirSync(protoBrain).filter(f => f.endsWith('.md') && f !== 'README.md').sort()) {
      const raw = fs.readFileSync(path.join(protoBrain, file), 'utf8');
      // Left as the prototype shipped it: Luci's own default is the newer version of the same file
      const shipped = snapshot(`brain/${file}`);
      if (shipped !== null && normalize(stripBom(raw)) === normalize(stripBom(shipped))) continue;
      const theirs = renameText(raw);
      const target = path.join(memory.globalBrainDir, file);
      const mine = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      const defaultFile = path.join(DEFAULT_BRAIN_DIR, file);
      const unchangedDefault = mine !== null && fs.existsSync(defaultFile) && normalize(mine) === normalize(fs.readFileSync(defaultFile, 'utf8'));
      const emptyHistory = mine !== null && file === 'decision-history.md' && !/^\| \d{4}-/m.test(mine);
      if (mine !== null && normalize(mine) === normalize(theirs)) continue;
      if (mine === null || unchangedDefault || emptyHistory) { globalWrites.set(target, theirs); report.globalBrain.copied.push(file); }
      else report.globalBrain.keptYours.push(file);
    }
  }

  // Agent files: the prototype's section is replaced by Luci's in place
  const agentEdits = new Map<string, string>();
  const cursorRules = path.join(dir, '.cursor', 'rules');
  const candidates = [...PROTOTYPE.agentFiles, ...(fs.existsSync(cursorRules) ? fs.readdirSync(cursorRules).filter(f => f.endsWith('.mdc')).map(f => `.cursor/rules/${f}`) : [])];
  for (const rel of candidates) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const start = PROTOTYPE.markerStart.exec(text);
    if (!start) continue;
    const endMatch = PROTOTYPE.markerEnd.exec(text.slice(start.index));
    const end = endMatch ? start.index + endMatch.index + endMatch[0].length : text.length;
    const label = start[1]!.trim().toUpperCase();
    const luci = LUCI_AGENTS[label];
    const name = AGENT_LABELS[label] ?? label.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    // Supported agents get an empty Luci section that configureAgent fills; others get the full section now
    const replacement = luci ? `${agentStartMarker(name)}\n${AGENT_END_MARKER}` : agentBlock({ agentLabel: name, heading: `${name} Project Guidelines`, extra: [`- Framework: ${info.framework}`] }).trimEnd();
    agentEdits.set(file, `${text.slice(0, start.index)}${replacement}${text.slice(end)}`);
    report.agentFiles.push({ file: rel, action: luci ? `${PRODUCT.name} section replaces the old one` : `${PRODUCT.name} section replaces the old one (${PRODUCT.command} update does not refresh it yet)` });
  }
  for (const id of Object.values(LUCI_AGENTS)) {
    const rel = id === 'claudeCode' ? 'CLAUDE.md' : '.cursorrules';
    if (!report.agentFiles.some(a => a.file === rel)) report.agentFiles.push({ file: rel, action: fs.existsSync(path.join(dir, rel)) ? `${PRODUCT.name} section added` : 'created' });
  }

  report.next.push(`Check ${PRODUCT.projectDir}/, then delete ${PROTOTYPE.projectDir}/: ${PRODUCT.name} no longer reads it, and agents now point to ${PRODUCT.projectDir}/.`);
  if (report.lock.notInLibrary.length) {
    report.next.push(`Selected skills not in ${PRODUCT.name}'s library: ${report.lock.notInLibrary.join(', ')}. Add one from its source with \`${PRODUCT.command} skills add <github link>\`, or drop it with \`${PRODUCT.command} skills deselect <name>\`.`);
  }
  report.next.push(`If the prototype's MCP server is registered with your agent, replace it with ${PRODUCT.mcpServer}.`);
  if (dryRun) return report;

  // Write: Luci's layout first, then everything carried over on top of it
  writeBrain(dir, info, { starterSkills: true, ...(options.version ? { version: options.version } : {}) });
  for (const [rel, content] of writes) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  if (lockEntries.length) writeLock(dir, { lss: LSS_VERSION, skills: lockEntries });
  memory.initGlobalBrain();
  for (const [target, content] of globalWrites) fs.writeFileSync(target, content, 'utf8');
  writeGlobalBrainSnapshot(dir, memory.globalBrainDir);
  await writeCatalog(dir, registry);
  for (const [file, content] of agentEdits) fs.writeFileSync(file, content, 'utf8');
  for (const id of Object.values(LUCI_AGENTS)) configureAgent(id, dir, info);
  return report;
}
