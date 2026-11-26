/// <reference lib="dom" />
/**
 * The dev toolbar goes into an app without the person editing code (user request, 2026-11-15):
 * `luci toolbar` finds the root file, `luci init` offers it, `luci serve` offers it again.
 */
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, transform } from 'esbuild';
import { chromium } from 'playwright';
import { initProject } from '@luci-dev/brain';
import { run } from '../src/run.js';
import type { CliContext } from '../src/context.js';
import { startBridge } from '../src/serve/bridge.js';
import { addToolbar, agentFixPrompt, findToolbarTarget, loaderLines, removeToolbar, toolbarInstalledIn } from '../src/toolbarSetup.js';

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

describe('agentFixPrompt and loader behavior (B-45, B-46)', () => {
  it('includes --port when port is not 4545 and handles copy fallback (B-45)', () => {
    expect(agentFixPrompt(4545)).toContain('`luci serve`');
    expect(agentFixPrompt(4545)).not.toContain('--port');
    expect(agentFixPrompt(4599)).toContain('`luci serve --port 4599`');
    const lines = loaderLines('html', 4599).join('\n');
    expect(lines).toContain("Couldn't copy");
  });

  it('clamps offline badge position and shows retry feedback (B-46)', () => {
    const lines = loaderLines('html', 4599).join('\n');
    expect(lines).toContain("min('+v.x+'px,calc(100vw - 260px))");
    expect(lines).toContain("min('+v.y+'px,calc(100vh - 120px))");
    expect(lines).toContain('Checking');
    expect(lines).toContain('Still not running');
  });
});

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
    // Storybook-only repo falls back to .storybook/preview-body.html automatically
    expect(findToolbarTarget(project({ '.storybook/main.ts': 'export default {}' }))).toMatchObject({
      rel: '.storybook/preview-body.html',
      kind: 'snippet',
      what: 'Storybook preview-body.html'
    });
    // Repo with both an app root and Storybook uses the app root by default, and Storybook with --storybook
    const both = project({ 'index.html': VITE, '.storybook/main.ts': 'export default {}' });
    expect(findToolbarTarget(both)).toMatchObject({ rel: 'index.html', kind: 'html' });
    expect(findToolbarTarget(both, { storybook: true })).toMatchObject({ rel: '.storybook/preview-body.html', kind: 'snippet' });
  });

  it('adds and removes the loader in .storybook/preview-body.html with --storybook or auto-detection', async () => {
    // 1. Storybook-only repo without an existing preview-body.html
    const sbOnly = project({ '.storybook/main.ts': 'export default {}' });
    const added = ctx(sbOnly);
    expect(await run(['toolbar'], added)).toBe(0);
    expect(added.lines.join('\n')).toContain('Added the dev toolbar to .storybook/preview-body.html');
    const bodyHtml = read(sbOnly, '.storybook/preview-body.html');
    expect(bodyHtml).toContain('<!-- luci:toolbar');
    expect(bodyHtml).toContain('http://127.0.0.1:4545/toolbar.js');
    expect(toolbarInstalledIn(sbOnly)?.rel).toBe('.storybook/preview-body.html');

    // Second run is a no-op
    const again = ctx(sbOnly);
    expect(await run(['toolbar'], again)).toBe(0);
    expect(again.lines.join('\n')).toContain('already in .storybook/preview-body.html');

    // Remove leaves the file clean (without deleting user file)
    const removed = ctx(sbOnly);
    expect(await run(['toolbar', 'remove'], removed)).toBe(0);
    expect(read(sbOnly, '.storybook/preview-body.html').trim()).toBe('');

    // 2. App + Storybook repo with existing preview-body.html: --storybook targets only Storybook
    const existingPreview = '<div id="custom-portal"></div>\n';
    const mixed = project({
      'index.html': VITE,
      '.storybook/main.ts': 'export default {}',
      '.storybook/preview-body.html': existingPreview
    });
    const dry = ctx(mixed);
    expect(await run(['toolbar', '--storybook', '--dry-run'], dry)).toBe(0);
    expect(dry.lines.join('\n')).toContain('Would add to .storybook/preview-body.html');
    expect(read(mixed, '.storybook/preview-body.html')).toBe(existingPreview);

    const addSb = ctx(mixed);
    expect(await run(['toolbar', '--storybook'], addSb)).toBe(0);
    expect(read(mixed, 'index.html')).toBe(VITE);
    expect(read(mixed, '.storybook/preview-body.html')).toContain('<div id="custom-portal"></div>');
    expect(read(mixed, '.storybook/preview-body.html')).toContain('<!-- luci:toolbar');

    const rmSb = ctx(mixed);
    expect(await run(['toolbar', 'remove', '--storybook'], rmSb)).toBe(0);
    expect(read(mixed, '.storybook/preview-body.html')).toBe(existingPreview);
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
    expect(tsx).toContain("{process.env.NODE_ENV === 'development' && <script dangerouslySetInnerHTML={{ __html:");
    expect(tsx).toContain('http://127.0.0.1:4545/toolbar.js');
    expect(tsx).toContain('<body>{children}\r\n');
    expect(tsx.split('\n').every(l => l === '' || l.endsWith('\r') || l === tsx.split('\n').at(-1))).toBe(true);
    removeToolbar(dir);
    expect(read(dir, 'app/layout.tsx')).not.toContain('luci:toolbar');
  });

  it('replaces an older Luci loader block with the new one and leaves one block only', async () => {
    const oldHtml = VITE.replace(
      '  </body>',
      '    <!-- luci:toolbar (dev only: Luci\'s dev toolbar) -->\n    <script>if (/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)) document.head.appendChild(Object.assign(document.createElement(\'script\'), { src: \'http://127.0.0.1:4545/toolbar.js\' }));</script>\n    <!-- /luci:toolbar -->\n  </body>'
    );
    const dir = project({ 'index.html': oldHtml });
    const c1 = ctx(dir);
    expect(await run(['toolbar'], c1)).toBe(0);
    expect(c1.lines.join('\n')).toContain('Updated the dev toolbar in index.html');
    const updated = read(dir, 'index.html');
    expect(updated).toContain("Luci isn't running");
    expect(updated.match(/<!-- luci:toolbar\b/g)).toHaveLength(1);
    expect(updated.match(/<!-- \/luci:toolbar -->/g)).toHaveLength(1);

    // Running a second time leaves the single block unchanged
    const c2 = ctx(dir);
    expect(await run(['toolbar'], c2)).toBe(0);
    expect(c2.lines.join('\n')).toContain('The dev toolbar is already in index.html.');
    expect(read(dir, 'index.html')).toBe(updated);

    // Next.js old loader block is also upgraded cleanly
    const oldNext = NEXT.replace(
      '      <body>{children}</body>',
      '      <body>{children}\n        {/* luci:toolbar (dev only) */}\n        {process.env.NODE_ENV === \'development\' && <script src="http://127.0.0.1:4545/toolbar.js" async />}\n        {/* /luci:toolbar */}\n      </body>'
    );
    const nextDir = project({ 'app/layout.tsx': oldNext });
    const nc1 = ctx(nextDir);
    expect(await run(['toolbar'], nc1)).toBe(0);
    expect(nc1.lines.join('\n')).toContain('Updated the dev toolbar in app/layout.tsx');
    expect(read(nextDir, 'app/layout.tsx')).toContain('dangerouslySetInnerHTML');
    expect(read(nextDir, 'app/layout.tsx').match(/\{\/\* luci:toolbar\b/g)).toHaveLength(1);
  });

  it('B-80: rejects bad ports, upgrades/removes manual script, and init --dry-run --toolbar previews insertion', async () => {
    const dir = project({ 'index.html': VITE });

    // 1. Port validation
    const badPort0 = ctx(dir);
    expect(await run(['toolbar', '--port', '0'], badPort0)).toBe(1);
    expect(badPort0.lines.join('\n')).toContain('Not a port: 0');

    const badPortAbc = ctx(dir);
    expect(await run(['toolbar', '--port', 'abc'], badPortAbc)).toBe(1);
    expect(badPortAbc.lines.join('\n')).toContain('Not a port: abc');

    const badPortEq = ctx(dir);
    expect(await run(['toolbar', '--port=0'], badPortEq)).toBe(1);
    expect(badPortEq.lines.join('\n')).toContain('Not a port: 0');

    // 2. Manual script without comment markers is upgraded and removed
    const manualHtml = VITE.replace('  </body>', '    <script src="http://127.0.0.1:4545/toolbar.js"></script>\n  </body>');
    const manualDir = project({ 'index.html': manualHtml });

    const cUpgrade = ctx(manualDir);
    expect(await run(['toolbar'], cUpgrade)).toBe(0);
    expect(cUpgrade.lines.join('\n')).toContain('Updated the dev toolbar in index.html');
    expect(read(manualDir, 'index.html')).toContain('<!-- luci:toolbar');

    // Test removing manual script directly
    const manualDir2 = project({ 'index.html': manualHtml });
    const cRemove = ctx(manualDir2);
    expect(await run(['toolbar', 'remove'], cRemove)).toBe(0);
    expect(cRemove.lines.join('\n')).toContain('Took the dev toolbar out of index.html');
    expect(read(manualDir2, 'index.html')).toBe(VITE);

    // 3. init --dry-run --toolbar previews insertion without modifying disk
    const initDir = project({ 'index.html': VITE });
    const cInit = ctx(initDir);
    expect(await run(['init', '--yes', '--dry-run', '--toolbar'], cInit)).toBe(0);
    expect(cInit.lines.join('\n')).toContain('Would add to index.html');
    expect(read(initDir, 'index.html')).toBe(VITE);
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

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function renderNextLayoutToHtml(layoutTsx: string, nodeEnv: 'development' | 'production'): Promise<string> {
  const transformed = await transform(layoutTsx, {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    define: { 'process.env.NODE_ENV': JSON.stringify(nodeEnv) }
  });
  const cjs = transformed.code.replace(/export\s+default\s+function\s+RootLayout/, 'function RootLayout');
  type VNode = { tag: string; props: Record<string, unknown> | null; children: unknown[] };
  const h = (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): VNode => ({ tag, props, children });
  const toHtml = (node: unknown): string => {
    if (node == null || node === false || node === true) return '';
    if (Array.isArray(node)) return node.map(toHtml).join('');
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    const v = node as VNode;
    const attrs = Object.entries(v.props ?? {})
      .filter(([k]) => k !== 'dangerouslySetInnerHTML' && k !== 'children')
      .map(([k, val]) => (val === true ? ` ${k}` : ` ${k}="${String(val)}"`))
      .join('');
    const inner = (v.props?.dangerouslySetInnerHTML as { __html?: string } | undefined)?.__html
      ?? v.children.map(toHtml).join('');
    return `<${v.tag}${attrs}>${inner}</${v.tag}>`;
  };
  const tree = new Function('h', `${cjs}\nreturn RootLayout({ children: h('main', { id: 'app-main' }, h('h1', null, 'Next App')) });`)(h);
  return `<!doctype html>${toHtml(tree)}`;
}

describe('"Luci isn\'t running" loader badge in Chrome (Vite and Next.js)', { timeout: 90_000 }, () => {
  it('shows when serve is off with no layout shift, copies the fix with the port, retries into the toolbar without reload, hides when serve is on, and never shows in production', async () => {
    const entry = fileURLToPath(new URL('../../toolbar/src/script.ts', import.meta.url));
    const built = await build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
    const toolbarBundle = built.outputFiles[0]!.text;
    const browser = await chromium.launch();

    try {
      for (const kind of ['vite', 'nextjs'] as const) {
        const servePort = await freePort();
        const appDir = project(
          kind === 'vite'
            ? {
                'package.json': '{"name":"vite-demo"}',
                'index.html': '<!doctype html><html><head><title>Vite</title></head><body style="margin:0"><main id="app-main" style="padding:24px"><h1>Vite App</h1></main></body></html>'
              }
            : {
                'package.json': '{"name":"next-demo"}',
                'app/layout.tsx': NEXT
              }
        );
        await initProject(appDir);
        const baselineHtml = kind === 'vite'
          ? read(appDir, 'index.html')
          : await renderNextLayoutToHtml(read(appDir, 'app/layout.tsx'), 'development');

        addToolbar(appDir, { port: servePort });

        const devHtml = kind === 'vite'
          ? read(appDir, 'index.html')
          : await renderNextLayoutToHtml(read(appDir, 'app/layout.tsx'), 'development');
        const prodHtml = kind === 'vite'
          ? devHtml
          : await renderNextLayoutToHtml(read(appDir, 'app/layout.tsx'), 'production');

        let mode: 'baseline' | 'dev' | 'prod' = 'baseline';
        const appServer = http.createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(mode === 'baseline' ? baselineHtml : mode === 'prod' ? prodHtml : devHtml);
        });
        await new Promise<void>(r => appServer.listen(0, '127.0.0.1', () => r()));
        const appPort = (appServer.address() as AddressInfo).port;
        const appOrigin = `http://127.0.0.1:${appPort}`;

        const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await bctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appOrigin });
        const page = await bctx.newPage();

        // Measure baseline layout without loader
        mode = 'baseline';
        await page.goto(appOrigin);
        const beforeRect = await page.locator('#app-main').boundingBox();

        // (a) serve off: badge shows, no layout shift, copy button copies the fix with the right port
        mode = 'dev';
        await page.goto(appOrigin);
        await page.evaluate(() => { (window as unknown as { __NO_RELOAD__?: boolean }).__NO_RELOAD__ = true; });
        const badge = page.locator('luci-offline [data-part="offline-badge"]');
        await badge.waitFor({ state: 'visible' });
        expect(await badge.innerText()).toContain("Luci isn't running");
        expect(await badge.innerText()).toContain('Start luci serve in this project.');
        const afterRect = await page.locator('#app-main').boundingBox();
        expect(afterRect, `${kind} layout shift`).toEqual(beforeRect);

        const copyBtn = badge.locator('[data-action="copy-fix"]');
        await copyBtn.click();
        await expect.poll(async () => copyBtn.innerText()).toBe('Copied');
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toBe(agentFixPrompt(servePort));

        // (b) start serve, press Retry: badge goes, toolbar appears without page reload
        const bridge = await startBridge({
          projectDir: appDir,
          port: servePort,
          version: '0.5.7',
          toolbarScript: () => toolbarBundle
        });
        try {
          await badge.locator('[data-action="retry"]').click();
          await page.locator('luci-offline').waitFor({ state: 'detached' });
          await page.locator('luci-feedback, luci-launcher').first().waitFor({ state: 'attached' });
          expect(await page.evaluate(() => (window as unknown as { __NO_RELOAD__?: boolean }).__NO_RELOAD__)).toBe(true);

          // (c) serve on from the start: no badge
          const pageOn = await bctx.newPage();
          await pageOn.goto(appOrigin);
          await pageOn.locator('luci-feedback, luci-launcher').first().waitFor({ state: 'attached' });
          expect(await pageOn.locator('luci-offline').count()).toBe(0);
          await pageOn.close();
        } finally {
          await bridge.close();
        }

        // (d) production build: no loader, no badge
        const pageProd = await bctx.newPage();
        if (kind === 'vite') {
          await pageProd.route('https://prod.example.com/**', route =>
            route.fulfill({ status: 200, contentType: 'text/html', body: prodHtml })
          );
          await pageProd.goto('https://prod.example.com/');
        } else {
          mode = 'prod';
          await pageProd.goto(appOrigin);
        }
        await pageProd.waitForTimeout(200);
        expect(await pageProd.locator('luci-offline').count(), `${kind} prod badge`).toBe(0);
        expect(await pageProd.locator('luci-feedback, luci-launcher').count(), `${kind} prod toolbar`).toBe(0);

        await bctx.close();
        await new Promise<void>(r => appServer.close(() => r()));
      }
    } finally {
      await browser.close();
    }
  });
});
