/**
 * Puts the dev toolbar into an app without the person editing code (user request, 2026-11-15):
 * find the app's root file, add a small loader between `luci:toolbar` markers, take it out again.
 *
 * The loader only runs where the app is opened on this machine (localhost), or in development, so
 * nothing changes for a deployed site and no package has to be installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT, stripBom } from '@luci-dev/format';

export const TOOLBAR_START = 'luci:toolbar';
export const TOOLBAR_END = '/luci:toolbar';
const NOTE = `dev only: ${PRODUCT.name}'s dev toolbar from \`${PRODUCT.command} serve\` on this machine; remove with \`${PRODUCT.command} toolbar remove\``;

/** How the loader is written in the file it goes into. */
export type LoaderKind = 'html' | 'astro' | 'jsx';

export interface ToolbarTarget {
  /** Absolute path of the file. */
  file: string;
  /** Project-relative path, for messages. */
  rel: string;
  kind: LoaderKind;
  /** What the file is, in words ("Vite index.html", "Next.js root layout"). */
  what: string;
}

const scriptUrl = (port: number) => `http://127.0.0.1:${port}/toolbar.js`;

/** The lines added to the file (without indentation). */
export function loaderLines(kind: LoaderKind, port: number): string[] {
  const url = scriptUrl(port);
  const load = `if (/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)) document.head.appendChild(Object.assign(document.createElement('script'), { src: '${url}' }));`;
  if (kind === 'jsx') {
    return [
      `{/* ${TOOLBAR_START} (${NOTE}) */}`,
      `{process.env.NODE_ENV === 'development' && <script src="${url}" async />}`,
      `{/* ${TOOLBAR_END} */}`
    ];
  }
  return [
    `<!-- ${TOOLBAR_START} (${NOTE}) -->`,
    `<script${kind === 'astro' ? ' is:inline' : ''}>${load}</script>`,
    `<!-- ${TOOLBAR_END} -->`
  ];
}

const exists = (f: string) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const read = (f: string) => stripBom(fs.readFileSync(f, 'utf8'));
const first = (dir: string, names: readonly string[]) => names.map(n => path.join(dir, n)).find(exists);
const SCRIPT_EXT = ['tsx', 'jsx', 'js', 'ts'];

/**
 * Where the toolbar goes, most specific framework first: Next.js (app or pages router), SvelteKit,
 * Astro, then an index.html (Vite, Create React App, Angular, plain sites). Null when none is found.
 */
export function findToolbarTarget(projectDir: string): ToolbarTarget | null {
  const t = (file: string | undefined, kind: LoaderKind, what: string): ToolbarTarget | null =>
    (file && /<\/body>/i.test(read(file)) ? { file, rel: path.relative(projectDir, file).replace(/\\/g, '/'), kind, what } : null);
  const candidates: (() => ToolbarTarget | null)[] = [
    () => t(first(projectDir, ['app', 'src/app'].flatMap(d => SCRIPT_EXT.map(e => `${d}/layout.${e}`))), 'jsx', 'Next.js root layout'),
    () => t(first(projectDir, ['pages', 'src/pages'].flatMap(d => SCRIPT_EXT.map(e => `${d}/_document.${e}`))), 'jsx', 'Next.js _document'),
    () => t(first(projectDir, ['src/app.html']), 'html', 'SvelteKit app.html'),
    () => {
      const dir = path.join(projectDir, 'src', 'layouts');
      let layouts: string[] = [];
      try { layouts = fs.readdirSync(dir).filter(f => f.endsWith('.astro')); } catch { /* no layouts */ }
      const pick = layouts.find(f => /^(Base)?Layout\.astro$/i.test(f)) ?? (layouts.length === 1 ? layouts[0] : undefined);
      return t(pick ? path.join(dir, pick) : undefined, 'astro', 'Astro layout');
    },
    () => t(first(projectDir, ['index.html']), 'html', 'index.html'),
    () => t(first(projectDir, ['src/index.html']), 'html', 'index.html'),
    () => t(first(projectDir, ['public/index.html']), 'html', 'index.html')
  ];
  for (const c of candidates) {
    const found = c();
    if (found) return found;
  }
  return null;
}

/** The file that has the toolbar (between its markers, or any line that loads toolbar.js), if any. */
export function toolbarInstalledIn(projectDir: string): ToolbarTarget | null {
  const target = findToolbarTarget(projectDir);
  if (target && INSTALLED.test(read(target.file))) return target;
  return null;
}
/** The markers, or a line someone added by hand from `luci serve`'s instructions. */
const INSTALLED = /luci:toolbar|127\.0\.0\.1:\d+\/toolbar\.js/;

export type AddResult =
  | { status: 'added' | 'already'; target: ToolbarTarget; lines: string[] }
  | { status: 'not-found' };

/** Add the loader before </body> of the app's root file (kept as it is when it is already there). */
export function addToolbar(projectDir: string, options: { port?: number; dryRun?: boolean } = {}): AddResult {
  const target = findToolbarTarget(projectDir);
  if (!target) return { status: 'not-found' };
  const port = options.port ?? 4545;
  const lines = loaderLines(target.kind, port);
  const text = read(target.file);
  if (INSTALLED.test(text)) return { status: 'already', target, lines };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  // Before the last </body>, indented one step deeper than it
  const at = text.search(/<\/body>(?![\s\S]*<\/body>)/i);
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart, at))![0];
  const inner = `${indent}${indent.includes('\t') ? '\t' : '  '}`;
  const onOwnLine = text.slice(lineStart, at).trim() === '';
  const block = lines.map(l => `${inner}${l}`).join(eol);
  const updated = onOwnLine
    ? `${text.slice(0, lineStart)}${block}${eol}${text.slice(lineStart)}`
    : `${text.slice(0, at)}${eol}${block}${eol}${indent}${text.slice(at)}`;
  if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
  return { status: 'added', target, lines };
}

/** Take the loader out again: every block between the markers, in the file Luci would use. */
export function removeToolbar(projectDir: string, options: { dryRun?: boolean } = {}): { status: 'removed' | 'none'; target?: ToolbarTarget } {
  const target = findToolbarTarget(projectDir);
  if (!target) return { status: 'none' };
  const text = read(target.file);
  const block = /^[ \t]*(?:<!--|\{\/\*) luci:toolbar\b[\s\S]*?\/luci:toolbar (?:-->|\*\/\})[ \t]*\r?\n?/gm;
  const updated = text.replace(block, '');
  if (updated === text) return { status: 'none', target };
  if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
  return { status: 'removed', target };
}

/** What to do by hand when no root file is found. */
export function manualToolbarHelp(port = 4545): string[] {
  return [
    `Add this line to your app's root HTML or layout, before </body>:`,
    `  <script src="${scriptUrl(port)}"></script>`,
    `Or ask your agent: "Add ${PRODUCT.name}'s dev toolbar to this app (\`${PRODUCT.command} toolbar\`)."`
  ];
}
