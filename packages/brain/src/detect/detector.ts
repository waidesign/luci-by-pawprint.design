import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRODUCT, type ProjectCommands } from '@luci/format';
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
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageJson {
  name?: string;
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
  'nextjs', 'remix', 'react-vite', 'react', 'vue', 'nuxt', 'svelte', 'angular', 'plain-frontend'
]);
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
    return {
      ...(typeof pkg['name'] === 'string' && pkg['name'] ? { name: pkg['name'] } : {}),
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

/** Inspect a project folder. Reads files only; never writes. */
export function detectProject(targetDir: string = process.cwd()): ProjectInfo {
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

  return {
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
    hasGraphify: has(GRAPH_JSON)
  };
}
