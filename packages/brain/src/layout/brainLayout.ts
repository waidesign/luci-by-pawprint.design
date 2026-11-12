/**
 * Builds the files of the project memory folder (.luci/, layout 1) from the
 * templates in templates/luci/ and the facts the detector found.
 * See docs/format/memory-layout.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGENT_FILES,
  AGENT_MARKER_PREFIX,
  AUTO_DETECTED,
  BRAIN_JSON_FILES,
  LAYOUT_VERSION,
  LOCAL_GITIGNORE,
  MEMORY_FILES,
  PRECEDENCE,
  PRODUCT,
  brainJsonSchema,
  parseBrainJson,
  parseJsonText,
  type BrainJson,
  type ParseResult,
  type ProjectCommands
} from '@luci/format';
import { isRecord } from '../fs/readJson.js';
import type { ProjectInfo } from '../detect/detector.js';

/** templates/luci/, next to src/ and dist/. */
export const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/luci/', import.meta.url));

/** The project memory folder of a project. */
export const memoryDir = (projectDir: string) => path.join(projectDir, PRODUCT.projectDir);
/** A path inside .luci/, written with forward slashes for reports. */
export const memoryPath = (rel: string) => `${PRODUCT.projectDir}/${rel.replace(/\\/g, '/')}`;

const FOLDER_NOTES: Readonly<Record<string, string>> = {
  src: 'source code', app: 'app routes and pages', pages: 'pages/routes', components: 'shared components',
  lib: 'library code', libs: 'library code', packages: 'workspace packages', apps: 'workspace apps',
  public: 'static files served as-is', static: 'static files', assets: 'images, fonts and other assets',
  styles: 'stylesheets', test: 'tests', tests: 'tests', __tests__: 'tests', e2e: 'end-to-end tests', spec: 'tests',
  docs: 'documentation', scripts: 'scripts and tooling', bin: 'executables', cmd: 'command entry points',
  internal: 'internal packages', api: 'API code', server: 'server code', client: 'client code',
  config: 'configuration', migrations: 'database migrations', prisma: 'database schema', db: 'database code',
  examples: 'examples', fixtures: 'test fixtures', templates: 'templates', infra: 'infrastructure', deploy: 'deployment'
};
const IGNORED_FOLDERS = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'vendor', 'venv', '.venv', 'env',
  '__pycache__', 'graphify-out', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache'
]);
const LOCAL_PATH = memoryPath(`${MEMORY_FILES.local}/`);
const CATALOG_PATH = memoryPath(MEMORY_FILES.skillCatalog);
const GENERATED_PATHS = ['dist/', 'build/', '.next/', 'out/', 'coverage/', 'graphify-out/', CATALOG_PATH, LOCAL_PATH];
const STYLING_LABEL: Readonly<Record<string, string>> = {
  tailwindcss: 'Tailwind CSS', 'shadcn-ui': 'shadcn/ui', motion: 'Motion', threejs: 'three.js'
};

/** Facts about a project used by the templates. */
export interface ProjectFacts {
  info: ProjectInfo;
  commands: ProjectCommands;
  folders: string[];
  generated: string[];
  hasUi: boolean;
}

export function projectFacts(info: ProjectInfo, projectDir: string): ProjectFacts {
  const folders: string[] = [];
  try {
    for (const e of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.') || IGNORED_FOLDERS.has(e.name)) continue;
      folders.push(e.name);
    }
  } catch { /* unreadable folder */ }
  folders.sort();

  // The code map folder and Luci's own local/ are always listed; build output only when present
  const generated = GENERATED_PATHS.filter(p => p === LOCAL_PATH || p === CATALOG_PATH || p === 'graphify-out/' || fs.existsSync(path.join(projectDir, p)));
  return { info, commands: info.commands, folders, generated, hasUi: info.hasUi };
}

const code = (s: string) => `\`${s}\``;
const list = (items: readonly string[]) => (items.length ? items.join(', ') : 'none detected');

/** One line naming the detected stack, for rules.md. */
function stackRule(facts: ProjectFacts): string {
  const { info } = facts;
  const parts: string[] = [];
  const framework = ['unknown', 'node'].includes(info.framework) ? null : info.framework;
  parts.push(framework ? `${code(framework)} with ${list(info.languages)}` : list(info.languages));
  if (facts.hasUi) {
    const libs = info.uiLibraries.map(l => STYLING_LABEL[l] ?? l);
    parts.push(libs.length ? `UI libraries: ${libs.join(', ')}` : 'styling: plain CSS (no UI or styling library detected)');
  }
  if (info.testingFrameworks.length) parts.push(`tests: ${info.testingFrameworks.join(', ')}`);
  return `Stack: ${parts.join('; ')}. Use these; don't add another framework, UI, styling, animation or test library without asking.`;
}

function protectedPaths(facts: ProjectFacts): string {
  const { lockfiles, packageManager } = facts.info;
  const lines: string[] = [];
  if (lockfiles.length) {
    const viaPm = lockfiles.some(f => /^(package-lock|pnpm-lock|yarn|bun)/.test(f)) ? ` (${code(packageManager)})` : '';
    lines.push(`  - Lockfiles (${lockfiles.map(code).join(', ')}): change only through the package manager${viaPm}.`);
  } else {
    lines.push('  - Lockfiles: change only through the package manager.');
  }
  lines.push(`  - Generated output: ${facts.generated.map(code).join(', ')}. Change the source, not the output.`);
  lines.push(`  - Secrets: ${['.env*', '*.pem', '*.key'].map(code).join(', ')}. Never read them into chat, print or commit them.`);
  return lines.join('\n');
}

function checkCommands(facts: ProjectFacts): string {
  const c = facts.commands;
  const found = [c.test, c.lint, c.typecheck].filter((x): x is string => Boolean(x));
  return found.length ? found.map(code).join(', ') : "the project's checks (none detected yet: add the commands to `context.md`)";
}

function stackSection(facts: ProjectFacts): string {
  const { info } = facts;
  return [
    `- Framework: ${info.framework === 'unknown' ? 'not detected' : info.framework}`,
    `- Languages: ${list(info.languages)}`,
    `- Package manager: ${info.packageManager}`,
    ...(facts.hasUi ? [`- UI libraries: ${list(info.uiLibraries)}`] : []),
    `- Testing: ${list(info.testingFrameworks)}`
  ].join('\n');
}

function commandsSection(facts: ProjectFacts): string {
  const c = facts.commands;
  const row = (label: string, cmd: string | null) => `- ${label}: ${cmd ? code(cmd) : 'not found'}`;
  const lines = [row('Dev', c.dev), row('Build', c.build), row('Test', c.test), row('Lint', c.lint), row('Type check', c.typecheck)];
  if (!c.test) lines.push('', '_No test command found. Add one, or describe here how a change is checked._');
  return lines.join('\n');
}

function folderSection(facts: ProjectFacts): string {
  if (!facts.folders.length) return '_No folders yet._';
  return facts.folders.map(f => `- ${code(`${f}/`)}${FOLDER_NOTES[f] ? `: ${FOLDER_NOTES[f]}` : ''}`).join('\n');
}

/** Generated bodies for the "(auto-detected)" sections of context.md, by heading. */
export function autoSections(facts: ProjectFacts): Record<string, string> {
  return {
    [`## Stack ${AUTO_DETECTED}`]: stackSection(facts),
    [`## Commands ${AUTO_DETECTED}`]: commandsSection(facts),
    [`## Folder Map ${AUTO_DETECTED}`]: folderSection(facts)
  };
}

/** Values for {{PLACEHOLDERS}} in templates/luci. */
export function templateVars(facts: ProjectFacts, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  const auto = autoSections(facts);
  const testCmd = facts.commands.test;
  return {
    PROJECT_NAME: facts.info.projectName,
    PRODUCT_NAME: PRODUCT.name,
    COMMAND: PRODUCT.command,
    MEMORY_DIR: PRODUCT.projectDir,
    MARKER: AGENT_MARKER_PREFIX,
    AGENT_FILES: Object.values(AGENT_FILES).map(code).join(' and '),
    DATE: new Date().toISOString().slice(0, 10),
    FRAMEWORK: facts.info.framework,
    STACK_SECTION: auto[`## Stack ${AUTO_DETECTED}`] ?? '',
    COMMANDS_SECTION: auto[`## Commands ${AUTO_DETECTED}`] ?? '',
    FOLDER_SECTION: auto[`## Folder Map ${AUTO_DETECTED}`] ?? '',
    STACK_RULE: stackRule(facts),
    PROTECTED_PATHS: protectedPaths(facts),
    CHECK_COMMANDS: checkCommands(facts),
    TEST_DONE: testCmd ? `${code(testCmd)} passes.` : "The project's checks pass (no test command detected yet; see Commands).",
    TEST_COMMAND: testCmd ? code(testCmd) : "the project's tests",
    ...extra
  };
}

/**
 * Render a template: {{NAME}} placeholders, and blocks between
 * `<!-- if:ui -->` and `<!-- endif:ui -->` kept only when the flag is on.
 */
export function renderTemplate(
  content: string,
  vars: Readonly<Record<string, string>>,
  flags: Readonly<Record<string, boolean>> = {}
): string {
  let out = content.replace(/\r\n/g, '\n');
  out = out.replace(/<!-- if:(\w+) -->\n?([\s\S]*?)<!-- endif:\1 -->\n?/g, (_m, flag: string, body: string) => (flags[flag] ? body : ''));
  out = out.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => vars[key] ?? m);
  return out.replace(/\n{3,}/g, '\n\n');
}

/** Read and render one file from templates/luci, or null when there is no such template. */
export function renderTemplateFile(
  relPath: string,
  facts: ProjectFacts,
  options: { templatesDir?: string; extraVars?: Readonly<Record<string, string>> } = {}
): string | null {
  const file = path.join(options.templatesDir ?? TEMPLATES_DIR, relPath);
  if (!fs.existsSync(file)) return null;
  return renderTemplate(fs.readFileSync(file, 'utf8'), templateVars(facts, options.extraVars), { ui: facts.hasUi });
}

const KNOWN_KEYS = new Set(Object.keys(brainJsonSchema.shape));

/**
 * brain.json: Luci's own record. Detected values are refreshed every time; top-level
 * keys someone added, and an edited precedence list, are kept.
 */
export function buildBrainJson(facts: ProjectFacts, existing: Readonly<Record<string, unknown>> = {}, version = ''): BrainJson {
  const { info } = facts;
  const extras = Object.fromEntries(Object.entries(existing).filter(([k]) => !KNOWN_KEYS.has(k)));
  const edited = existing['precedence'];
  const precedence = Array.isArray(edited) && edited.length && edited.every(p => typeof p === 'string' && p)
    ? (edited as string[])
    : [...PRECEDENCE];
  return {
    layout: LAYOUT_VERSION,
    generatedBy: `${PRODUCT.packageName}${version ? ` ${version}` : ''}`,
    project: {
      name: info.projectName,
      framework: info.framework,
      languages: info.languages,
      packageManager: info.packageManager,
      hasUi: facts.hasUi,
      uiLibraries: info.uiLibraries,
      testing: info.testingFrameworks,
      commands: facts.commands
    },
    precedence,
    files: { ...BRAIN_JSON_FILES },
    ...extras
  };
}

const brainJsonPath = (projectDir: string) => path.join(memoryDir(projectDir), MEMORY_FILES.brain);

/** .luci/brain.json, validated. null when the file does not exist. */
export function readBrainJson(projectDir: string): ParseResult<BrainJson> | null {
  const file = brainJsonPath(projectDir);
  if (!fs.existsSync(file)) return null;
  return parseBrainJson(fs.readFileSync(file, 'utf8'));
}

/** The top-level object in brain.json even when it fails validation, so added keys survive a rewrite. */
export function readBrainJsonObject(projectDir: string): Record<string, unknown> | null {
  const file = brainJsonPath(projectDir);
  if (!fs.existsSync(file)) return null;
  const json = parseJsonText(fs.readFileSync(file, 'utf8'));
  return json.ok && isRecord(json.value) ? json.value : null;
}

/** The local/ folder keeps itself out of git, so no edit to the project's .gitignore is needed. */
export function ensureLocalDir(projectDir: string): string {
  const dir = path.join(memoryDir(projectDir), MEMORY_FILES.local);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, LOCAL_GITIGNORE, 'utf8');
  return dir;
}
