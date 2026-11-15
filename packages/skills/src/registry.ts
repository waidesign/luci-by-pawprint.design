import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT_FILE,
  META,
  SKILL_FILE,
  fmMap,
  fmString,
  parseFrontmatter,
  parseSkillContract,
  skillPreferencesFile,
  userSkillsDir,
  type FrontmatterMap,
  type SkillContract
} from '@luci-dev/format';
import { readSkillPreferences, type SkillPreferences } from './preferences.js';
import { estimateTokens, type LibraryKind, type Skill } from './types.js';

export const INDEX_FILE = 'index.json';
const INDEX_VERSION = 1;

/** Luci's own skill library, shipped in this package. */
export const OFFICIAL_SKILLS_DIR = fileURLToPath(new URL('../library/', import.meta.url));

const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);

type SkillRecord = Omit<Skill, 'content'>;

/** Turn a parsed skill (LSS folder or legacy single file) into the registry's skill shape. */
function toSkillRecord(args: { data: FrontmatterMap; contract: SkillContract; relPath: string; categoryFromPath: string; isLss: boolean }): SkillRecord {
  const { data, contract, relPath, categoryFromPath, isLss } = args;
  const str = (key: string) => fmString(data[key]);
  if (isLss) {
    const meta = fmMap(data['metadata']);
    const m = (key: string) => fmString(meta[key]);
    return {
      id: str('name'),
      name: m(META.title) || str('name'),
      category: m(META.category) || categoryFromPath,
      description: str('description'),
      author: m(META.author) || 'unknown',
      license: str('license') || 'UNKNOWN',
      version: m(META.version) || '1.0.0',
      tags: toList(meta[META.tags]),
      keywords: toList(contract.keywords),
      frameworks: contract.frameworks?.length ? contract.frameworks : ['any'],
      dependencies: contract.dependsOn ?? [],
      relatedSkills: contract.related ?? [],
      lastVerified: contract.lastVerified ?? null,
      summary: contract.summary ?? '',
      contract,
      format: 'lss',
      path: relPath
    };
  }

  // Legacy single-file skill (frontmatter with id/name/category/...)
  const id = str('id') || path.basename(relPath, '.md');
  const list = (key: string) => (Array.isArray(data[key]) ? (data[key] as string[]) : []);
  return {
    id,
    name: str('name') || id,
    category: str('category') || categoryFromPath,
    description: str('description'),
    author: str('author') || 'unknown',
    license: str('license') || 'UNKNOWN',
    version: str('version') || '1.0.0',
    tags: toList(data['tags']),
    keywords: [],
    frameworks: list('frameworks').length ? list('frameworks') : ['any'],
    dependencies: list('dependencies'),
    relatedSkills: list('relatedSkills'),
    lastVerified: str('lastVerified') || null,
    summary: '',
    contract: {},
    format: 'legacy',
    path: relPath
  };
}

function readContract(file: string): SkillContract {
  if (!fs.existsSync(file)) return {};
  const r = parseSkillContract(fs.readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

export interface SkillRegistryOptions {
  /** The library folder (default: Luci's official library). */
  skillsDir?: string;
  /** What that folder is: 'official' (default), 'personal' or 'project'. */
  library?: LibraryKind;
  /**
   * Also load the user's personal library (~/.luci/skills) and skill preferences
   * (pin/block). Off by default, so tests and the benchmark see only the given library.
   */
  user?: boolean;
  userSkillsDir?: string;
  preferencesFile?: string;
  /** Rewrite index.json when skills changed (default true; a read-only folder just keeps scanning). */
  autoIndex?: boolean;
}

interface ScannedFile {
  file: string;
  isLss: boolean;
}

export class SkillRegistry {
  readonly skillsDir: string;
  readonly library: LibraryKind;
  readonly skills = new Map<string, Skill>();
  readonly categories = new Set<string>();
  initialized = false;
  duplicates: string[] = [];
  overrides: string[] = [];
  loadedFromIndex = false;
  readonly autoIndex: boolean;
  readonly user: boolean;
  readonly personal: SkillRegistry | null;
  readonly preferencesFile: string | null;
  preferences: SkillPreferences = { pinned: [], blocked: [] };

  constructor(options: SkillRegistryOptions = {}) {
    this.skillsDir = options.skillsDir ?? OFFICIAL_SKILLS_DIR;
    this.library = options.library ?? 'official';
    this.autoIndex = options.autoIndex !== false;
    this.user = Boolean(options.user);
    this.personal = this.user
      ? new SkillRegistry({ skillsDir: options.userSkillsDir ?? userSkillsDir(), library: 'personal', autoIndex: this.autoIndex })
      : null;
    this.preferencesFile = this.user ? (options.preferencesFile ?? skillPreferencesFile()) : null;
  }

  /** Where `luci skills add` saves skills: the personal library when loaded. */
  get personalDir(): string | null {
    return this.personal ? this.personal.skillsDir : null;
  }

  /** Skill files on disk: LSS folders (SKILL.md) and legacy single .md files. */
  listSkillFiles(): ScannedFile[] {
    const found: ScannedFile[] = [];
    const walk = (dir: string) => {
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      if (entries.some(e => e.isFile() && e.name === SKILL_FILE)) {
        found.push({ file: path.join(dir, SKILL_FILE), isLss: true });
        return; // files inside a skill folder (references/, scripts/) are not skills
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') found.push({ file: full, isLss: false });
      }
    };
    walk(this.skillsDir);
    return found.sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Cheap fingerprint of the library: paths and sizes of skill files and contracts. */
  fingerprint(files: readonly ScannedFile[]): string {
    return files.map(({ file, isLss }) => {
      const rel = path.relative(this.skillsDir, file).replace(/\\/g, '/');
      const contractFile = path.join(path.dirname(file), CONTRACT_FILE);
      const contractSize = isLss && fs.existsSync(contractFile) ? fs.statSync(contractFile).size : 0;
      return `${rel}:${fs.statSync(file).size}:${contractSize}`;
    }).join('|');
  }

  /** Read and parse every skill file. Returns records with token estimates. */
  scanSkills(files: readonly ScannedFile[] = this.listSkillFiles()): { record: SkillRecord; content: string | undefined }[] {
    const records: { record: SkillRecord; content: string | undefined }[] = [];
    for (const { file, isLss } of files) {
      try {
        const { data, content } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
        const relPath = path.relative(this.skillsDir, file).replace(/\\/g, '/');
        const categoryFromPath = relPath.includes('/') ? relPath.split('/')[0] ?? 'general' : 'general';
        const contract = isLss ? readContract(path.join(path.dirname(file), CONTRACT_FILE)) : {};
        const record = toSkillRecord({ data, contract, relPath, categoryFromPath, isLss });
        record.tokenEstimate = estimateTokens(content);
        records.push({ record, content });
      } catch (err) {
        process.emitWarning(`Could not load the skill in ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return records;
  }

  /** The metadata index (what `luci skills index` writes to index.json). */
  buildIndex(): { version: number; fingerprint: string; skills: SkillRecord[] } {
    const files = this.listSkillFiles();
    return { version: INDEX_VERSION, fingerprint: this.fingerprint(files), skills: this.scanSkills(files).map(r => r.record) };
  }

  /** Write this library's index (and the personal library's, when loaded and present). */
  writeIndex(): ReturnType<SkillRegistry['buildIndex']> {
    const index = this.buildIndex();
    fs.writeFileSync(path.join(this.skillsDir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    if (this.personal && fs.existsSync(this.personal.skillsDir)) this.personal.writeIndex();
    return index;
  }

  /** The saved index, if it exists and still matches the files on disk. */
  readFreshIndex(files: readonly ScannedFile[]): { skills: SkillRecord[] } | null {
    const indexFile = path.join(this.skillsDir, INDEX_FILE);
    if (!fs.existsSync(indexFile)) return null;
    try {
      const index = JSON.parse(fs.readFileSync(indexFile, 'utf8').replace(/^﻿/, '')) as { version?: number; fingerprint?: string; skills?: SkillRecord[] };
      if (index.version !== INDEX_VERSION || !Array.isArray(index.skills)) return null;
      return index.fingerprint === this.fingerprint(files) ? { skills: index.skills } : null;
    } catch {
      return null;
    }
  }

  /** Attach `content` as a lazy property: the skill body is read only when used. */
  attachContent(record: SkillRecord, preloaded: string | undefined): Skill {
    const filePath = path.join(this.skillsDir, record.path);
    let cached = preloaded;
    Object.defineProperty(record, 'content', {
      enumerable: false,
      configurable: true,
      get() {
        if (cached === undefined) {
          try { cached = parseFrontmatter(fs.readFileSync(filePath, 'utf8')).content; } catch { cached = ''; }
        }
        return cached;
      }
    });
    const skill = record as Skill;
    skill.filePath = filePath;
    skill.dir = path.dirname(filePath);
    return skill;
  }

  async loadSkills(): Promise<Skill[]> {
    this.skills.clear();
    this.categories.clear();
    this.duplicates = [];
    this.overrides = [];

    if (this.user && this.preferencesFile) this.preferences = readSkillPreferences(this.preferencesFile);
    if (!fs.existsSync(this.skillsDir)) {
      await this.mergePersonal();
      this.initialized = true;
      return [...this.skills.values()];
    }

    const files = this.listSkillFiles();
    const index = this.readFreshIndex(files);
    const entries = index
      ? index.skills.map(record => ({ record: { ...record }, content: undefined as string | undefined }))
      : this.scanSkills(files);

    // Skills were added or edited since the index was written: refresh it (best effort)
    if (!index && this.autoIndex && files.length > 0) {
      try {
        const fresh = { version: INDEX_VERSION, fingerprint: this.fingerprint(files), skills: entries.map(e => e.record) };
        fs.writeFileSync(path.join(this.skillsDir, INDEX_FILE), `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
      } catch { /* not writable */ }
    }

    for (const { record, content } of entries) {
      if (this.skills.has(record.id)) {
        this.duplicates.push(record.id);
        continue; // first one wins; the linter reports duplicates
      }
      record.library = this.library;
      this.skills.set(record.id, this.attachContent(record, content));
      this.categories.add(record.category);
    }

    await this.mergePersonal();
    this.initialized = true;
    this.loadedFromIndex = Boolean(index);
    return [...this.skills.values()];
  }

  /** Add the user's personal library. A personal skill with an official one's name replaces it for this user. */
  async mergePersonal(): Promise<void> {
    if (!this.personal) return;
    for (const skill of await this.personal.loadSkills()) {
      const existing = this.skills.get(skill.id);
      if (existing) {
        skill.overrides = existing.library ?? 'official';
        this.overrides.push(skill.id);
      }
      this.skills.set(skill.id, skill);
      this.categories.add(skill.category);
    }
    this.duplicates.push(...this.personal.duplicates);
  }

  /** Reload preferences after `luci skills pin/block` (skills stay loaded). */
  reloadPreferences(): SkillPreferences {
    if (this.user && this.preferencesFile) this.preferences = readSkillPreferences(this.preferencesFile);
    return this.preferences;
  }

  async ensureLoaded(): Promise<void> {
    if (!this.initialized) await this.loadSkills();
  }

  async getAllSkills(): Promise<Skill[]> {
    await this.ensureLoaded();
    return [...this.skills.values()];
  }

  async getSkill(id: string): Promise<Skill | null> {
    await this.ensureLoaded();
    return this.skills.get(id) ?? null;
  }

  async getCategories(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.categories].sort();
  }

  async getSkillsByCategory(category: string): Promise<Skill[]> {
    await this.ensureLoaded();
    return [...this.skills.values()].filter(s => s.category.toLowerCase() === category.toLowerCase());
  }

  async validateSkill(id: string): Promise<{ valid: boolean; errors: string[] }> {
    const skill = await this.getSkill(id);
    if (!skill) return { valid: false, errors: ['Skill not found'] };
    const errors: string[] = [];
    if (!skill.name) errors.push('Missing name');
    if (!skill.description) errors.push('Missing description');
    if (!skill.category) errors.push('Missing category');
    if (!skill.content) errors.push('Missing skill content');
    return { valid: errors.length === 0, errors };
  }
}
