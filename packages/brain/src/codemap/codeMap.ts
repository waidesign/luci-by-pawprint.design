/**
 * The built-in code map (B6), powered by Graphify: a graph of how the project's files and
 * functions connect, so agents can look things up instead of reading whole files.
 * Graphify is optional. Without it Luci skips the map instead of failing, and Luci never
 * installs it without the user's explicit go-ahead (see installer.ts).
 * Graphify runs in code-only mode: local parsing, no model calls, no API keys.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT } from '@luci-dev/format';
import { TOOL_ENV, findTool, type FoundTool } from './toolLocator.js';

export const GRAPHIFY_OUT_DIR = 'graphify-out';
export const GRAPHIFY_PACKAGE = 'graphifyy';
export const CODE_MAP_SETUP_HINT = `The code map is optional. Install Graphify with \`${PRODUCT.command} map --install\` (or yourself: uv tool install ${GRAPHIFY_PACKAGE}).`;

const CLI_TIMEOUT_MS = 5 * 60 * 1000;
// Files Graphify maps in code-only mode; a change to anything else does not make the map stale
const CODE_FILE = /\.(c|cc|cpp|cs|cjs|cts|go|h|hpp|java|js|jsx|kt|mjs|mts|php|py|rb|rs|scala|svelte|swift|ts|tsx|vue)$/i;
const STALE_SAMPLE = 5;

const IGNORE_SOURCE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.output', '.output-test', '.output-check',
  '.luci', 'coverage', '__pycache__', '.venv', 'venv', '.next', '.nuxt', '.svelte-kit'
]);

/** Returns true if the project contains at least one source code file matching CODE_FILE. Fast: stops at first match. */
export function hasCodeFiles(dir: string): boolean {
  try {
    const queue = [dir];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORE_SOURCE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            queue.push(path.join(current, entry.name));
          }
        } else if (entry.isFile() && CODE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          return true;
        }
      }
    }
  } catch {
    return true;
  }
  return false;
}

export interface GraphPaths {
  jsonPath: string;
  htmlPath: string;
  reportPath: string;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
}

export type MapFreshness =
  | { status: 'missing' }
  | { status: 'fresh'; builtAtCommit: string | null; head: string | null }
  | { status: 'stale'; builtAtCommit: string | null; head: string | null; changedFiles: number; sample: string[] }
  | { status: 'unknown'; reason: string };

export type GenerateResult =
  | { skipped: true; reason: 'not-installed' | 'no-source-code'; summary: string }
  | ({ skipped?: false; reused: boolean; mode?: 'full' | 'incremental'; summary: string } & GraphPaths & GraphStats);

/** Runs a command and returns its stdout; throws on failure. Replaced in tests. */
export type RunCommand = (command: string, args: readonly string[], cwd: string) => string;

const defaultRun: RunCommand = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: TOOL_ENV, timeout: CLI_TIMEOUT_MS });

const git = (dir: string, args: readonly string[]): string | null => {
  try {
    // Only the end is trimmed: `status --porcelain` lines start with a meaningful space
    return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', timeout: 30_000 }).trimEnd();
  } catch {
    return null;
  }
};

export function graphPaths(dir: string): GraphPaths {
  const out = path.join(dir, GRAPHIFY_OUT_DIR);
  return { jsonPath: path.join(out, 'graph.json'), htmlPath: path.join(out, 'graph.html'), reportPath: path.join(out, 'GRAPH_REPORT.md') };
}

/** The project's graph paths if graphify-out/graph.json exists, otherwise null. */
export function locateGraph(dir: string): GraphPaths | null {
  const paths = graphPaths(dir);
  return fs.existsSync(paths.jsonPath) ? paths : null;
}

/** Node and edge counts (Graphify stores edges as `links`). Null for missing, corrupt or empty graphs. */
export function readGraphStats(jsonPath: string): GraphStats | null {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { nodes?: unknown; links?: unknown; edges?: unknown };
    if (!Array.isArray(data.nodes) || data.nodes.length === 0) return null;
    const edges = Array.isArray(data.links) ? data.links : Array.isArray(data.edges) ? data.edges : [];
    return { nodeCount: data.nodes.length, edgeCount: edges.length };
  } catch {
    return null;
  }
}

/** The commit Graphify recorded when it built the map, if any. */
export function builtAtCommit(jsonPath: string): string | null {
  try {
    const value = (JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { built_at_commit?: unknown }).built_at_commit;
    return typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Is the map current? It is stale when a code file changed after it was built: a file that
 * differs from the commit Graphify recorded (committed since, or not committed yet) and was
 * written after graph.json. Needs git; without it the answer is "unknown".
 */
export function mapFreshness(dir: string): MapFreshness {
  const paths = locateGraph(dir);
  if (!paths) return { status: 'missing' };
  const head = git(dir, ['rev-parse', 'HEAD'])?.trim() ?? null;
  if (head === null) return { status: 'unknown', reason: 'not a git repository (or git is not installed)' };
  const built = builtAtCommit(paths.jsonPath);
  const builtAt = fs.statSync(paths.jsonPath).mtimeMs;

  const changed = new Set<string>();
  const add = (out: string | null) => out?.split('\n').map(l => l.trim()).filter(Boolean).forEach(f => changed.add(f));
  if (built && built !== head) add(git(dir, ['diff', '--name-only', `${built}..HEAD`]));
  else if (!built) add(git(dir, ['log', '--since', `@${Math.floor(builtAt / 1000)}`, '--name-only', '--format=']));
  // Uncommitted changes, including new files
  add(git(dir, ['status', '--porcelain', '--untracked-files=all'])?.split('\n').map(l => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '')).join('\n') ?? null);

  const stale = [...changed]
    .filter(f => CODE_FILE.test(f) && !f.startsWith(`${GRAPHIFY_OUT_DIR}/`))
    .filter(f => {
      // A deleted file has no time to compare, so it is not counted
      try { return fs.statSync(path.join(dir, f)).mtimeMs > builtAt; } catch { return false; }
    })
    .sort();
  return stale.length
    ? { status: 'stale', builtAtCommit: built, head, changedFiles: stale.length, sample: stale.slice(0, STALE_SAMPLE) }
    : { status: 'fresh', builtAtCommit: built, head };
}

export class CodeMap {
  readonly projectRoot: string;
  private cli: FoundTool | null | undefined;
  private readonly run: RunCommand;
  private readonly locate: (name: string) => FoundTool | null;

  constructor(options: { projectRoot?: string; run?: RunCommand; locate?: (name: string) => FoundTool | null } = {}) {
    this.projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    this.run = options.run ?? defaultRun;
    this.locate = options.locate ?? findTool;
  }

  /** Finds Graphify on PATH or in uv's tool folder. Pass refresh: true after installing it. */
  resolveCli(options: { refresh?: boolean } = {}): FoundTool | null {
    if (options.refresh || this.cli === undefined) this.cli = this.locate('graphify');
    return this.cli;
  }

  /** Installed Graphify version (e.g. "graphify 0.9.107"), or null when it is not installed. */
  getCliVersion(options: { refresh?: boolean } = {}): string | null {
    return this.resolveCli(options)?.version ?? null;
  }

  /** Run Graphify: an incremental update when a map exists, else a full code-only build plus clustering. */
  runGraphifyCli(targetDir: string, options: { incremental?: boolean } = {}): 'full' | 'incremental' {
    const cli = this.resolveCli();
    if (!cli) throw new Error(`Graphify is not installed. ${CODE_MAP_SETUP_HINT}`);
    const run = (...args: string[]) => this.run(cli.command, args, targetDir);

    if (options.incremental && locateGraph(targetDir)) {
      try {
        run('update', '.');
        return 'incremental';
      } catch {
        // fall through to a full build
      }
    }
    try {
      run('extract', '.', '--code-only');
    } catch (err) {
      const e = err as { stderr?: unknown; message?: string };
      const detail = String(e.stderr || e.message || '').trim().split('\n').slice(-5).join('\n');
      throw new Error(`Graphify failed to build the code map.\n${detail}\nIf your Graphify is outdated, update it with: uv tool upgrade ${GRAPHIFY_PACKAGE}`);
    }
    try {
      run('cluster-only', '.', '--no-label');
    } catch {
      // The report and HTML are optional; graph.json alone is usable
    }
    return 'full';
  }

  /**
   * Build or reuse the project's code map. When Graphify is not installed this returns
   * { skipped: true } instead of failing, because it is optional.
   *   force: refresh an existing map (incremental: only changed files)
   *   full:  rebuild from scratch
   */
  async generate(options: { targetDir?: string; force?: boolean; full?: boolean } = {}): Promise<GenerateResult> {
    const targetDir = options.targetDir ?? this.projectRoot;
    const full = Boolean(options.full);
    const force = Boolean(options.force) || full;

    if (!this.getCliVersion()) {
      return { skipped: true, reason: 'not-installed', summary: `Skipped: Graphify is not installed. ${CODE_MAP_SETUP_HINT}` };
    }
    if (!hasCodeFiles(targetDir)) {
      return { skipped: true, reason: 'no-source-code', summary: 'No source code files (.ts, .js, .py, etc.) found in this project yet. The code map will build once source files are added.' };
    }
    if (!force) {
      const existing = locateGraph(targetDir);
      const stats = existing && fs.existsSync(existing.reportPath) ? readGraphStats(existing.jsonPath) : null;
      if (existing && stats) return { reused: true, ...existing, ...stats, summary: `The existing code map was kept (${stats.nodeCount} nodes).` };
    }

    const mode = this.runGraphifyCli(targetDir, { incremental: !full });
    const paths = graphPaths(targetDir);
    const stats = readGraphStats(paths.jsonPath);
    if (!stats) {
      throw new Error(`Graphify ran but produced no usable map at ${GRAPHIFY_OUT_DIR}/graph.json. Check that the project has source code that .gitignore or .graphifyignore does not exclude.`);
    }
    return {
      reused: false,
      mode,
      ...paths,
      ...stats,
      summary: `${mode === 'incremental' ? 'Updated' : 'Built'} the code map with Graphify (${stats.nodeCount} nodes, ${stats.edgeCount} relationships).`
    };
  }
}
