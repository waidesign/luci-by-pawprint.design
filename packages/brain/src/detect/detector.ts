import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRODUCT, type ProjectCommands } from '@luci-dev/format';
import { isRecord, readJsonFile } from '../fs/readJson.js';

/** What Luci knows about a project from its files. */
export interface ProjectInfo {
  projectPath: string;
  projectName: string;
  os: NodeJS.Platform;
  hasGit: boolean;
  packageManager: PackageManager;
  languages: string[];
  framework: string;
  isReact: boolean;
  buildSystem: string;
  uiLibraries: string[];
  hasUi: boolean;
  testingFrameworks: string[];
  commands: ProjectCommands;
  lockfiles: string[];
  dependencies: string[];
  /** Agents that already have an instruction file here. */
  aiConfigs: string[];
  /** The project has a .luci/ folder. */
  hasProjectBrain: boolean;
  /** A Graphify code map exists in graphify-out/. */
  hasGraphify: boolean;
  /**
   * The packages of a monorepo (pnpm, npm, yarn or bun workspaces), each with its own stack. Empty
   * for a single project. A monorepo's framework is "monorepo" unless its root is an app itself, and
   * its UI, React, test signals and dependencies are those of all its packages together.
   */
  packages: WorkspacePackage[];
}

/** What a package in a monorepo is. */
export type PackageKind = 'app' | 'library' | 'cli' | 'mcp-server' | 'server' | 'browser-extension';

export interface WorkspacePackage {
  name: string;
  /** Relative to the project, with forward slashes: "packages/cli". */
  path: string;
  kind: PackageKind;
  /** Its own framework ("node" when it has none). */
  framework: string;
  /** Package-specific rules from .luci/rules.md, if any. */
  rules?: string[];
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageJson {
  name?: string;
  /** It installs a command (a "bin" entry). */
  bin: boolean;
  /** Workspace patterns from "workspaces" (an array, or { packages: [...] }). */
  workspaces: string[];
  scripts: Record<string, unknown>;
  deps: Record<string, unknown>;
  /** What the app itself runs on: dependencies and peerDependencies (not devDependencies). */
  runtime: Record<string, unknown>;
}

// `npm init` writes a test script that only fails; it is not a real test command
const NPM_PLACEHOLDER_TEST = /no test specified/i;
const LOCKFILES = [
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock',
  'poetry.lock', 'Pipfile.lock', 'uv.lock', 'Cargo.lock', 'go.sum', 'composer.lock', 'Gemfile.lock'
];
export const UI_FRAMEWORKS: ReadonlySet<string> = new Set([
  'nextjs', 'remix', 'react-vite', 'react', 'preact', 'vue', 'nuxt', 'svelte', 'angular', 'plain-frontend'
]);
/** Frameworks that are a whole app (the others can also be a component library). */
const APP_FRAMEWORKS: ReadonlySet<string> = new Set(['nextjs', 'remix', 'react-vite', 'nuxt', 'angular', 'plain-frontend']);
/** Tools that build browser extensions. */
const EXTENSION_TOOLS = ['wxt', 'plasmo', '@crxjs/vite-plugin', 'webextension-polyfill'];
/** At most this many packages are read in a monorepo. */
export const MAX_PACKAGES = 60;
const PYTHON_FILES = ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'];
const SERVER_FRAMEWORKS = ['@nestjs/core', 'express', 'fastify', 'koa', 'hono'];
export const GRAPH_JSON = path.join('graphify-out', 'graph.json');

function readPackageJson(dir: string): PackageJson | null {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    const pkg = readJsonFile(file);
    if (!isRecord(pkg)) return null;
    const record = (v: unknown) => (isRecord(v) ? v : {});
    const ws = pkg['workspaces'];
    const patterns = Array.isArray(ws) ? ws : isRecord(ws) && Array.isArray(ws['packages']) ? ws['packages'] : [];
    return {
      ...(typeof pkg['name'] === 'string' && pkg['name'] ? { name: pkg['name'] } : {}),
      bin: typeof pkg['bin'] === 'string' || (isRecord(pkg['bin']) && Object.keys(pkg['bin']).length > 0),
      workspaces: patterns.filter((p): p is string => typeof p === 'string'),
      scripts: record(pkg['scripts']),
      deps: { ...record(pkg['dependencies']), ...record(pkg['devDependencies']) },
      runtime: { ...record(pkg['peerDependencies']), ...record(pkg['dependencies']) }
    };
  } catch {
    return null;
  }
}

function readLower(dir: string, files: readonly string[]): string {
  return files.map(f => { try { return fs.readFileSync(path.join(dir, f), 'utf8').toLowerCase(); } catch { return ''; } }).join('\n');
}

/** True when src/, app/ or lib/ (two levels deep) has a file matching `pattern`. Type declarations don't count. */
export function hasSourceFiles(dir: string, pattern: RegExp): boolean {
  const look = (folder: string, depth: number): boolean => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return false; }
    for (const e of entries) {
      if (e.isFile() && pattern.test(e.name) && !e.name.endsWith('.d.ts')) return true;
      if (e.isDirectory() && depth < 2 && !e.name.startsWith('.') && e.name !== 'node_modules' && look(path.join(folder, e.name), depth + 1)) return true;
    }
    return false;
  };
  return ['src', 'app', 'lib'].some(f => look(path.join(dir, f), 0));
}

/**
 * The project's own commands for dev, build, test, lint and typecheck, from
 * package.json scripts or the usual tool for the language. Missing ones are null.
 */
export function detectCommands(
  dir: string,
  ctx: { pkg: PackageJson | null; packageManager: PackageManager; languages: readonly string[]; has: (file: string) => boolean }
): ProjectCommands {
  const commands: ProjectCommands = { dev: null, build: null, test: null, lint: null, typecheck: null };
  const scripts = ctx.pkg?.scripts ?? {};
  const run = (name: string) => {
    if (ctx.packageManager === 'npm') return name === 'test' ? 'npm test' : `npm run ${name}`;
    return ctx.packageManager === 'bun' ? `bun run ${name}` : `${ctx.packageManager} ${name}`;
  };
  const pick = (names: readonly string[]) =>
    names.find(n => {
      const script = scripts[n];
      return typeof script === 'string' && !NPM_PLACEHOLDER_TEST.test(script);
    });
  const scriptFor: Record<keyof ProjectCommands, string | undefined> = {
    dev: pick(['dev', 'start', 'serve']),
    build: pick(['build']),
    test: pick(['test', 'test:unit']),
    lint: pick(['lint']),
    typecheck: pick(['typecheck', 'type-check', 'check-types', 'tsc'])
  };
  for (const key of Object.keys(scriptFor) as (keyof ProjectCommands)[]) {
    const name = scriptFor[key];
    if (name) commands[key] = run(name);
  }

  if (ctx.languages.includes('Python')) {
    const text = readLower(dir, PYTHON_FILES.filter(ctx.has));
    if (!commands.test && (text.includes('pytest') || ctx.has('tests') || ctx.has('pytest.ini'))) commands.test = 'pytest';
    if (!commands.lint && text.includes('ruff')) commands.lint = 'ruff check .';
    if (!commands.typecheck && text.includes('mypy')) commands.typecheck = 'mypy .';
  }
  if (ctx.languages.includes('Go')) {
    commands.build ??= 'go build ./...';
    commands.test ??= 'go test ./...';
    commands.lint ??= 'go vet ./...';
  }
  if (ctx.languages.includes('Rust')) {
    commands.build ??= 'cargo build';
    commands.test ??= 'cargo test';
    commands.lint ??= 'cargo clippy';
  }

  // Makefile targets fill what is still missing
  if (ctx.has('Makefile')) {
    let makefile = '';
    try { makefile = fs.readFileSync(path.join(dir, 'Makefile'), 'utf8'); } catch { /* unreadable */ }
    for (const key of Object.keys(commands) as (keyof ProjectCommands)[]) {
      if (!commands[key] && new RegExp(`^${key}\\s*:`, 'm').test(makefile)) commands[key] = `make ${key}`;
    }
  }
  return commands;
}

/** Workspace patterns: pnpm-workspace.yaml's "packages" list, else package.json's "workspaces". */
export function workspacePatterns(dir: string, pkg: Pick<PackageJson, 'workspaces'> | null): string[] {
  const yaml = path.join(dir, 'pnpm-workspace.yaml');
  if (fs.existsSync(yaml)) {
    const out: string[] = [];
    let inPackages = false;
    for (const raw of fs.readFileSync(yaml, 'utf8').split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, '');
      if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
      if (inPackages && /^\S/.test(line)) break;
      const item = inPackages ? /^\s*-\s*['"]?([^'"]+?)['"]?\s*$/.exec(line) : null;
      if (item) out.push(item[1]!);
    }
    if (out.length) return out;
  }
  return pkg?.workspaces ?? [];
}

/**
 * The package folders the patterns name (each with a package.json): "packages/*" (one level),
 * "packages/**" (any depth, up to 3), or a folder; "!pattern" leaves folders out.
 */
export function workspaceFolders(dir: string, patterns: readonly string[]): string[] {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const found = new Set<string>();
  const subfolders = (rel: string): string[] => {
    try {
      return fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => (rel ? `${rel}/${e.name}` : e.name));
    } catch {
      return [];
    }
  };
  const expand = (pattern: string): string[] => {
    const parts = norm(pattern).split('/');
    let current = [''];
    for (const part of parts) {
      const next: string[] = [];
      for (const base of current) {
        if (part === '**') {
          // Any depth up to 3 below here
          let level = [base];
          next.push(base);
          for (let d = 0; d < 3; d++) { level = level.flatMap(subfolders); next.push(...level); }
        } else if (part.includes('*')) {
          const re = new RegExp(`^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
          next.push(...subfolders(base).filter(f => re.test(f.split('/').pop()!)));
        } else {
          next.push(base ? `${base}/${part}` : part);
        }
      }
      current = next;
    }
    return current;
  };
  for (const p of patterns.filter(p => !p.startsWith('!'))) {
    for (const f of expand(p)) if (f && fs.existsSync(path.join(dir, f, 'package.json'))) found.add(f);
  }
  const excluded = new Set(patterns.filter(p => p.startsWith('!')).flatMap(p => expand(p.slice(1))));
  return [...found].filter(f => !excluded.has(f)).sort().slice(0, MAX_PACKAGES);
}

/** What a package is, from its manifest and stack. */
function packageKind(info: ProjectInfo, pkg: PackageJson | null, has: (f: string) => boolean): PackageKind {
  const deps = pkg?.deps ?? {};
  if (EXTENSION_TOOLS.some(t => deps[t]) || info.framework === 'browser-extension') return 'browser-extension';
  if (pkg?.bin) return deps['@modelcontextprotocol/sdk'] ? 'mcp-server' : 'cli';
  if (SERVER_FRAMEWORKS.some(s => deps[s])) return 'server';
  if (APP_FRAMEWORKS.has(info.framework)) return 'app';
  if (UI_FRAMEWORKS.has(info.framework) && (has('index.html') || typeof pkg?.scripts['dev'] === 'string')) return 'app';
  return 'library';
}

/** Inspect a project folder. Reads files only; never writes. A monorepo's packages are read too. */
export function detectProject(targetDir: string = process.cwd(), options: { packages?: boolean } = {}): ProjectInfo {
  const dir = path.resolve(targetDir);
  const has = (file: string) => fs.existsSync(path.join(dir, file));
  const pkg = readPackageJson(dir);
  const deps = pkg?.deps ?? {};
  const dep = (name: string) => Boolean(deps[name]);

  let packageManager: PackageManager = 'npm';
  if (has('pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (has('bun.lockb') || has('bun.lock')) packageManager = 'bun';
  else if (has('yarn.lock')) packageManager = 'yarn';

  // Languages come from the project's own files, never assumed
  let rootFiles: string[] = [];
  try { rootFiles = fs.readdirSync(dir); } catch { /* unreadable folder */ }
  const hasTypeScript = has('tsconfig.json') || Object.keys(deps).some(d => d.includes('typescript'))
    || hasSourceFiles(dir, /\.(ts|tsx|mts|cts)$/i);
  const languages: string[] = [];
  if (hasTypeScript) languages.push('TypeScript');
  else if (pkg || has('jsconfig.json')) languages.push('JavaScript');
  const pythonFiles = PYTHON_FILES.filter(has);
  if (pythonFiles.length) languages.push('Python');
  if (has('go.mod')) languages.push('Go');
  if (has('Cargo.toml')) languages.push('Rust');
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) languages.push('Java/Kotlin');
  if (rootFiles.some(f => /\.(csproj|sln)$/i.test(f))) languages.push('C#');

  // Framework: UI frameworks first, then frontend signs, then server and other stacks.
  // A framework the app runs on (dependencies, peerDependencies) counts. One only in devDependencies
  // counts when the project's own files show it (SvelteKit lists svelte there; a tool that lists
  // react there only to test against it is not a React app).
  const viteConfig = has('vite.config.ts') || has('vite.config.js');
  const configFile = (base: string) => ['js', 'mjs', 'cjs', 'ts', 'mts'].some(ext => has(`${base}.${ext}`));
  const runtime = pkg?.runtime ?? {};
  const uses = (names: readonly string[], shown: () => boolean) => names.some(n => Boolean(runtime[n])) || (names.some(dep) && shown());
  const reactShown = () => viteConfig || has('index.html') || hasSourceFiles(dir, /\.(jsx|tsx)$/i);
  let framework = 'unknown';
  let isReact = false;
  if (uses(['next'], () => configFile('next.config') || has('pages') || has(path.join('src', 'app')) || has('app'))) {
    framework = 'nextjs';
    isReact = true;
  } else if (uses(['@remix-run/react'], () => configFile('remix.config') || has(path.join('app', 'root.tsx')) || has(path.join('app', 'root.jsx')))) {
    framework = 'remix';
    isReact = true;
  } else if (uses(['react', 'react-dom'], reactShown)) {
    framework = dep('vite') || viteConfig ? 'react-vite' : 'react';
    isReact = true;
  } else if (uses(['nuxt', 'vue'], () => configFile('nuxt.config') || hasSourceFiles(dir, /\.vue$/i))) {
    framework = dep('nuxt') ? 'nuxt' : 'vue';
  } else if (uses(['@sveltejs/kit', 'svelte'], () => configFile('svelte.config') || hasSourceFiles(dir, /\.svelte$/i))) {
    framework = 'svelte';
  } else if (uses(['@angular/core'], () => has('angular.json'))) {
    framework = 'angular';
  } else if (uses(['preact'], () => hasSourceFiles(dir, /\.(jsx|tsx)$/i))) {
    framework = 'preact';
  } else if (EXTENSION_TOOLS.some(dep) || /"manifest_version"/.test(readLower(dir, has('manifest.json') ? ['manifest.json'] : []))) {
    framework = 'browser-extension';
  } else if (has('index.html') || dep('vite') || dep('webpack') || dep('parcel') || viteConfig || has('webpack.config.js')) {
    framework = 'plain-frontend';
  } else if (pkg) {
    const server = SERVER_FRAMEWORKS.find(dep);
    framework = server ? server.replace('@nestjs/core', 'nestjs') : 'node';
  } else if (pythonFiles.length) {
    const text = readLower(dir, pythonFiles);
    framework = ['django', 'fastapi', 'flask'].find(f => text.includes(f)) ?? 'python';
  } else if (languages[0]) {
    framework = languages[0].toLowerCase();
  }

  let buildSystem = 'unknown';
  if (framework === 'nextjs') buildSystem = 'next';
  else if (viteConfig || dep('vite')) buildSystem = 'vite';
  else if (has('webpack.config.js') || dep('webpack')) buildSystem = 'webpack';

  const uiLibraries: string[] = [];
  if (dep('tailwindcss') || has('tailwind.config.js') || has('tailwind.config.ts')) uiLibraries.push('tailwindcss');
  if (has('components.json') || dep('@radix-ui/react-slot')) uiLibraries.push('shadcn-ui');
  if (dep('framer-motion') || dep('motion')) uiLibraries.push('motion');
  if (dep('three') || dep('@react-three/fiber')) uiLibraries.push('threejs');

  const testingFrameworks: string[] = [];
  if (dep('vitest')) testingFrameworks.push('vitest');
  if (dep('jest')) testingFrameworks.push('jest');
  if (dep('@playwright/test')) testingFrameworks.push('playwright');
  if (dep('cypress')) testingFrameworks.push('cypress');

  const aiConfigs: string[] = [];
  if (has('CLAUDE.md')) aiConfigs.push('claude-code');
  if (has('.cursorrules') || has('.cursor')) aiConfigs.push('cursor');
  if (has('AGENTS.md')) aiConfigs.push('codex');
  if (has('GEMINI.md')) aiConfigs.push('gemini-cli');
  if (has(path.join('.github', 'copilot-instructions.md'))) aiConfigs.push('github-copilot');

  const info: ProjectInfo = {
    projectPath: dir,
    projectName: pkg?.name ?? path.basename(dir),
    os: os.platform(),
    hasGit: has('.git'),
    packageManager,
    languages,
    framework,
    isReact,
    buildSystem,
    uiLibraries,
    hasUi: UI_FRAMEWORKS.has(framework) || uiLibraries.length > 0,
    testingFrameworks,
    commands: detectCommands(dir, { pkg, packageManager, languages, has }),
    lockfiles: LOCKFILES.filter(has),
    dependencies: Object.keys(deps),
    aiConfigs,
    hasProjectBrain: has(PRODUCT.projectDir),
    hasGraphify: has(GRAPH_JSON),
    packages: []
  };
  if (options.packages === false) return info;

  // A monorepo: each package's own stack, and the whole project's signals from all of them
  const folders = workspaceFolders(dir, workspacePatterns(dir, pkg));
  if (!folders.length) return info;
  const read = folders.map(rel => {
    const pkgDir = path.join(dir, rel);
    const sub = detectProject(pkgDir, { packages: false });
    const subPkg = readPackageJson(pkgDir);
    const kind = packageKind(sub, subPkg, f => fs.existsSync(path.join(pkgDir, f)));
    return { sub, entry: { name: sub.projectName, path: rel, kind, framework: sub.framework } satisfies WorkspacePackage };
  });
  const all = [info, ...read.map(r => r.sub)];
  const union = (pick: (i: ProjectInfo) => readonly string[]) => [...new Set(all.flatMap(pick))];
  return {
    ...info,
    // The root keeps its own framework when it is an app itself (a Next.js app with workspaces)
    framework: ['node', 'unknown', 'plain-frontend'].includes(info.framework) ? 'monorepo' : info.framework,
    languages: union(i => i.languages).sort((a, b) => Number(b === 'TypeScript') - Number(a === 'TypeScript')),
    isReact: all.some(i => i.isReact),
    uiLibraries: union(i => i.uiLibraries),
    hasUi: all.some(i => i.hasUi),
    testingFrameworks: union(i => i.testingFrameworks),
    dependencies: union(i => i.dependencies),
    packages: read.map(r => r.entry)
  };
}

/** "command line", "MCP server", "browser extension"...: how a package kind reads in Markdown. */
export const PACKAGE_KIND_LABEL: Readonly<Record<PackageKind, string>> = {
  app: 'app', library: 'library', cli: 'command line', 'mcp-server': 'MCP server', server: 'server', 'browser-extension': 'browser extension'
};
