/**
 * The dev toolbar goes into an app without the person editing code (user request, 2026-11-15):
 * `luci toolbar` finds the root file, `luci init` offers it, `luci serve` offers it again.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import type { CliContext } from '../src/context.js';
import { addToolbar, findToolbarTarget, removeToolbar, toolbarInstalledIn } from '../src/toolbarSetup.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-toolbar-setup-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}
const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
function ctx(cwd: string, answers: string[] = [], isTTY = false): CliContext & { lines: string[]; asked: string[] } {
  const lines: string[] = [];
  const asked: string[] = [];
  return {
    cwd, isTTY, lines, asked,
    out: l => lines.push(l ?? ''),
    err: l => lines.push(l ?? ''),
    ask: async q => { asked.push(q); return answers.shift() ?? ''; }
  };
}

const VITE = '<!doctype html>\n<html>\n  <head><title>App</title></head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n';
const NEXT = 'export default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n';

describe('finding the app\'s root file', () => {
  it('knows Next.js (app and pages), SvelteKit, Astro and index.html apps, most specific first', () => {
    expect(findToolbarTarget(project({ 'index.html': VITE }))).toMatchObject({ rel: 'index.html', kind: 'html' });
    expect(findToolbarTarget(project({ 'public/index.html': VITE }))).toMatchObject({ rel: 'public/index.html' });
    expect(findToolbarTarget(project({ 'src/app/layout.tsx': NEXT, 'index.html': VITE }))).toMatchObject({ rel: 'src/app/layout.tsx', kind: 'jsx', what: 'Next.js root layout' });
    expect(findToolbarTarget(project({ 'pages/_document.js': '<Html><Head /><body><Main /><NextScript /></body></Html>' }))).toMatchObject({ kind: 'jsx', what: 'Next.js _document' });
    expect(findToolbarTarget(project({ 'src/app.html': '<html><body>%sveltekit.body%</body></html>' }))).toMatchObject({ what: 'SvelteKit app.html' });
    expect(findToolbarTarget(project({ 'src/layouts/Layout.astro': '---\n---\n<html><body><slot /></body></html>' }))).toMatchObject({ kind: 'astro' });
    // A library or an empty folder: nothing to change
    expect(findToolbarTarget(project({ 'src/index.ts': 'export {}' }))).toBeNull();
  });
});

describe('adding and removing the loader', () => {
  it('adds a localhost-only loader before </body>, once, and takes it out again leaving the file as it was', () => {
    const dir = project({ 'index.html': VITE });
    const added = addToolbar(dir);
    expect(added.status).toBe('added');
    const html = read(dir, 'index.html');
    expect(html).toContain('    <!-- luci:toolbar (dev only:');
    expect(html).toMatch(/<script>if \(\/\^\(localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)\$\/\.test\(location\.hostname\)\)[^<]*'http:\/\/127\.0\.0\.1:4545\/toolbar\.js'/);
    expect(html.indexOf('/luci:toolbar')).toBeLessThan(html.indexOf('</body>'));
    expect(html.indexOf('/src/main.tsx')).toBeLessThan(html.indexOf('luci:toolbar'));
    expect(toolbarInstalledIn(dir)?.rel).toBe('index.html');
    // Twice changes nothing
    expect(addToolbar(dir).status).toBe('already');
    expect(read(dir, 'index.html')).toBe(html);
    expect(removeToolbar(dir).status).toBe('removed');
    expect(read(dir, 'index.html')).toBe(VITE);
    expect(removeToolbar(dir).status).toBe('none');
  });

  it('runs the loader in a browser: on localhost it loads toolbar.js, elsewhere it does nothing', () => {
    const dir = project({ 'index.html': VITE });
    addToolbar(dir, { port: 4600 });
    const code = /<script>(.*)<\/script>\s*\n\s*<!-- \/luci:toolbar/.exec(read(dir, 'index.html'))![1]!;
    for (const [hostname, loads] of [['localhost', true], ['127.0.0.1', true], ['example.com', false], ['myapp.vercel.app', false]] as const) {
      const appended: { src: string }[] = [];
      const document = { head: { appendChild: (s: { src: string }) => appended.push(s) }, createElement: () => ({}) };
      new Function('location', 'document', code)({ hostname }, document);
      expect(appended.map(s => s.src), hostname).toEqual(loads ? ['http://127.0.0.1:4600/toolbar.js'] : []);
    }
  });

  it('writes JSX for Next.js, in development only, and keeps Windows line endings', () => {
    const dir = project({ 'app/layout.tsx': NEXT.replace(/\n/g, '\r\n') });
    addToolbar(dir);
    const tsx = read(dir, 'app/layout.tsx');
    expect(tsx).toContain("{process.env.NODE_ENV === 'development' && <script src=\"http://127.0.0.1:4545/toolbar.js\" async />}");
    expect(tsx).toContain('<body>{children}\r\n');
    expect(tsx.split('\n').every(l => l === '' || l.endsWith('\r') || l === tsx.split('\n').at(-1))).toBe(true);
    removeToolbar(dir);
    expect(read(dir, 'app/layout.tsx')).not.toContain('luci:toolbar');
  });
});

describe('luci toolbar, init and serve', () => {
  it('`luci toolbar` adds it and says how to take it out; `luci toolbar remove` does', async () => {
    const dir = project({ 'index.html': VITE });
    const c = ctx(dir);
    expect(await run(['toolbar'], c)).toBe(0);
    expect(c.lines.join('\n')).toContain('Added the dev toolbar to index.html');
    expect(c.lines.join('\n')).toContain('luci toolbar remove');
    const r = ctx(dir);
    expect(await run(['toolbar', 'remove'], r)).toBe(0);
    expect(read(dir, 'index.html')).toBe(VITE);
    // No app here: says what to do by hand (or to ask the agent)
    const none = ctx(project({}));
    expect(await run(['toolbar'], none)).toBe(1);
    expect(none.lines.join('\n')).toContain('<script src="http://127.0.0.1:4545/toolbar.js"></script>');
  });

  it('`luci init` offers it in a terminal (yes by default), and `--toolbar` adds it without asking', async () => {
    const dir = project({ 'package.json': '{"name":"shop"}', 'index.html': VITE });
    const answers = Array(40).fill('');
    const c = ctx(dir, answers, true);
    expect(await run(['init', '-i'], c)).toBe(0);
    expect(c.asked.some(q => q.includes('Add Luci\'s dev toolbar to your app (index.html)?'))).toBe(true);
    expect(toolbarInstalledIn(dir)).not.toBeNull();

    const later = project({ 'package.json': '{"name":"shop"}', 'index.html': VITE });
    const y = ctx(later);
    expect(await run(['init', '--yes'], y)).toBe(0);
    // Non-interactive: never edits the app; it says how
    expect(toolbarInstalledIn(later)).toBeNull();
    expect(y.lines.join('\n')).toContain('Dev toolbar (notes, layout plans and captures in your running app): luci toolbar');
    expect(await run(['init', '--yes', '--toolbar'], ctx(later))).toBe(0);
    expect(toolbarInstalledIn(later)).not.toBeNull();
  });

  it('`luci init` answered no leaves the app alone and says how to add it later', async () => {
    const dir = project({ 'package.json': '{"name":"shop"}', 'index.html': VITE });
    const c = ctx(dir, [], true);
    c.ask = async q => { c.asked.push(q); return q.includes('dev toolbar') ? 'n' : ''; };
    expect(await run(['init', '-i'], c)).toBe(0);
    expect(read(dir, 'index.html')).toBe(VITE);
    expect(c.lines.join('\n')).toContain('Not added. Any time later: luci toolbar');
  });

  it('`luci serve` is the second chance: it offers the toolbar when it is missing, or says where it is', async () => {
    const dir = project({ 'package.json': '{"name":"shop"}', 'index.html': VITE });
    const stop = new AbortController();
    const c = { ...ctx(dir, ['y'], true), signal: stop.signal };
    const serving = run(['serve', '--port', '0'], c);
    await new Promise<void>(resolve => { const t = setInterval(() => { if (c.lines.some(l => l.startsWith('Added the dev toolbar'))) { clearInterval(t); resolve(); } }, 20); });
    stop.abort();
    expect(await serving).toBe(0);
    expect(c.asked.some(q => q.includes('dev toolbar'))).toBe(true);
    // The loader points at the port this serve runs on
    const port = /127\.0\.0\.1:(\d+)/.exec(c.lines.find(l => l.includes('is connected to'))!)![1];
    expect(read(dir, 'index.html')).toContain(`http://127.0.0.1:${port}/toolbar.js`);

    // Next time it is there: no question
    const again = new AbortController();
    const d = { ...ctx(dir, [], true), signal: again.signal };
    const serving2 = run(['serve', '--port', '0'], d);
    await new Promise<void>(resolve => { const t = setInterval(() => { if (d.lines.some(l => l.startsWith('Dev toolbar: in index.html'))) { clearInterval(t); resolve(); } }, 20); });
    again.abort();
    expect(await serving2).toBe(0);
    expect(d.asked).toEqual([]);
  });
});
