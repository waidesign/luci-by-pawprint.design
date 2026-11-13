/// <reference lib="dom" />
/**
 * Feedback in the browser (M6.4): what an item points at, read from a real React 19 app served the
 * way Vite serves one, and the two places items are kept (the project through `luci serve`, or this
 * browser only).
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, transform } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { FeedbackStore, initProject } from '@luci/brain';
import { SkillRegistry } from '@luci/skills';
import { browserBackend, bridgeBackend, decodeMappings, originalPosition, projectPath, stackFrames, type NewItem } from '../src/index.js';
import { startBridge } from '../../cli/src/serve/bridge.js';
import { serveApp, type AppServer } from './app.js';
import { tempProject } from '../../cli/test/helpers.js';

describe('stacks, paths and source maps (pure)', () => {
  it('reads Chrome and Firefox stack frames', () => {
    expect(stackFrames('Error: react-stack-top-frame\n    at exports.jsxDEV (http://127.0.0.1:5173/node_modules/.vite/deps/chunk.js:23791:31)\n    at PlanCard (http://127.0.0.1:5173/src/components/PlanCard.jsx:17:21)\n    at http://127.0.0.1:5173/src/main.jsx:4:68'))
      .toEqual([
        { url: 'http://127.0.0.1:5173/node_modules/.vite/deps/chunk.js', line: 23791, column: 31 },
        { url: 'http://127.0.0.1:5173/src/components/PlanCard.jsx', line: 17, column: 21 },
        { url: 'http://127.0.0.1:5173/src/main.jsx', line: 4, column: 68 }
      ]);
    expect(stackFrames('PlanCard@http://localhost:5173/src/PlanCard.tsx?t=17:12:3')).toEqual([{ url: 'http://localhost:5173/src/PlanCard.tsx?t=17', line: 12, column: 3 }]);
  });

  it('turns served URLs into project paths (Vite, Next with webpack or Turbopack, files)', () => {
    expect(projectPath('http://localhost:5173/src/pages/Pricing.tsx?t=1700000')).toBe('src/pages/Pricing.tsx');
    expect(projectPath('http://localhost:5173/@fs/home/me/shop/src/x.tsx')).toBe('/home/me/shop/src/x.tsx');
    expect(projectPath('webpack-internal:///(app-pages-browser)/./app/pricing/page.tsx')).toBe('app/pricing/page.tsx');
    expect(projectPath('turbopack:///[project]/app/page.tsx')).toBe('app/page.tsx');
    expect(projectPath('webpack://_N_E/./components/Card.tsx?abc')).toBe('components/Card.tsx');
    expect(projectPath('file:///C:/work/shop/src/App.jsx')).toBe('C:/work/shop/src/App.jsx');
  });

  it('decodes a source map: a JSX line maps back to the line it was written on', async () => {
    const source = 'export function Card() {\n  const x = 1;\n\n  return <button type="button">Go</button>;\n}\n';
    const out = await transform(source, { loader: 'jsx', jsx: 'automatic', jsxDev: true, sourcemap: 'external', sourcefile: '/src/Card.jsx' });
    const map = JSON.parse(out.map);
    const genLine = out.code.split('\n').findIndex(l => l.includes('"button"')) + 1;
    const col = out.code.split('\n')[genLine - 1]!.indexOf('jsxDEV(') + 1;
    expect(originalPosition(map, decodeMappings(map.mappings), genLine, col)).toMatchObject({ source: '/src/Card.jsx', line: 4 });
  });
});

describe('feedback targets on a real React 19 app (FR23, FR24, FR25)', { timeout: 60_000 }, () => {
  let browser: Browser;
  let app: AppServer;
  let bundle: string;
  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const built = build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'LuciFeedback', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
    [browser, app, bundle] = await Promise.all([chromium.launch(), serveApp(), built.then(r => r.outputFiles[0]!.text)]);
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await app?.close();
  });

  async function open(route: string): Promise<Page> {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`${app.origin}${route}`);
    await page.waitForSelector('main *');
    await page.addScriptTag({ content: bundle });
    return page;
  }
  const describeIn = (page: Page, selector: string, selectedText?: string) => page.evaluate(async ([sel, text]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).LuciFeedback;
    return L.describeTarget(document.querySelector(sel), text ? { selectedText: text } : {});
  }, [selector, selectedText] as const);

  it('a button in a component: its components (owners), its JSX line through the source map, and the page file', async () => {
    const page = await open('/pricing');
    const { target, pageSource } = await describeIn(page, '.plan:nth-of-type(2) button');
    expect(target).toMatchObject({
      kind: 'element',
      element: 'button',
      text: 'Start free trial',
      components: ['App', 'Pricing', 'PlanCard'],
      source: { file: 'src/components/PlanCard.jsx', line: 6 }
    });
    expect(pageSource).toBe('src/pages/Pricing.jsx');
    // The selector finds exactly that element
    expect(await page.evaluate(sel => document.querySelectorAll(sel).length === 1 && document.querySelectorAll(sel)[0] === document.querySelectorAll('.plan button')[1], target.selector)).toBe(true);
    expect(target.styles['background-color']).toBe('rgb(15, 98, 254)');
    expect(target.rect.width).toBeGreaterThan(0);
    await page.close();
  });

  it('selected text: a typo in a heading points at the heading and its line', async () => {
    const page = await open('/pricing');
    const { target } = await describeIn(page, 'h1', 'pricng');
    expect(target).toMatchObject({ kind: 'text', element: 'h1 (heading)', selectedText: 'pricng', text: 'Simple pricng for teams', components: ['App', 'Pricing'], source: { file: 'src/pages/Pricing.jsx', line: 6 } });
    await page.close();
  });

  it('other pages: a component in the checkout form, and the navigation in the layout', async () => {
    const checkout = await open('/checkout');
    const err = await describeIn(checkout, '[role=alert]');
    expect(err.target).toMatchObject({ element: 'p (alert)', text: 'Card number is not valid', components: ['App', 'Checkout', 'FieldError'], source: { file: 'src/components/FieldError.jsx', line: 2 } });
    expect(err.pageSource).toBe('src/pages/Checkout.jsx');
    await checkout.close();

    const home = await open('/');
    const nav = await describeIn(home, 'nav a:nth-of-type(2)');
    expect(nav.target).toMatchObject({ element: 'a (link)', text: 'Pricing', components: ['App', 'Layout', 'Nav'], source: { file: 'src/components/Nav.jsx', line: 7 } });
    // The layout is not a page: no page file from this element
    expect(nav.pageSource).toBeUndefined();
    await home.close();
  });

  it('an element React did not render keeps its selector and text only', async () => {
    const page = await open('/');
    const { target } = await page.evaluate(async () => {
      const el = document.createElement('aside');
      el.textContent = 'Injected';
      document.body.appendChild(el);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).LuciFeedback.describeTarget(el);
    });
    expect(target).toMatchObject({ element: 'aside (complementary)', text: 'Injected' });
    expect(target.components).toBeUndefined();
    expect(target.source).toBeUndefined();
    await page.close();
  });
});

describe('where items are kept (FR26, FR29)', () => {
  const item = (url: string, comment: string): NewItem => ({
    page: { url }, target: { kind: 'element', selector: 'main > button', element: 'button', text: 'Go' }, comment, intent: 'fix', priority: 'medium'
  });

  it('this browser: refs per page, sent state, answers, clearing', async () => {
    const map = new Map<string, string>();
    const b = browserBackend({ getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } });
    await b.add(item('http://localhost:5173/pricing', 'One'));
    await b.add(item('http://localhost:5173/checkout', 'Two'));
    await b.add(item('http://localhost:5173/pricing#faq', 'Three'));
    expect((await b.list()).map(i => i.ref)).toEqual(['P1-A1', 'P1-A2', 'P2-A1']);
    const first = await b.prompt({});
    expect(first.refs).toEqual(['P1-A1', 'P1-A2', 'P2-A1']);
    expect(first.prompt).toMatch(/^# UI feedback: 2 pages, 3 items/);
    expect((await b.prompt({})).prompt).toBeNull();
    expect((await b.prompt({ includeSent: true })).refs).toHaveLength(3);
    await b.add(item('http://localhost:5173/pricing', 'Four'));
    expect((await b.prompt({})).refs).toEqual(['P1-A3']);
    expect((await b.change('P1-A1', { action: 'resolve', summary: 'Done' })).status).toBe('resolved');
    expect(await b.clear('done')).toEqual(['P1-A1']);
    // Survives a "reload": a new backend on the same storage
    const again = browserBackend({ getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } });
    expect((await again.list()).map(i => i.ref)).toEqual(['P1-A2', 'P1-A3', 'P2-A1']);
  });

  it('the project, through luci serve: the agent sees the same items', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }) });
    await initProject(dir, { registry: new SkillRegistry({ user: false }) });
    const bridge = await startBridge({ projectDir: dir, port: 0 });
    try {
      // Node's fetch sends no Origin; the browser path is covered by the toolbar tests
      const b = bridgeBackend(bridge.url);
      expect(b.kind).toBe('project');
      await b.add(item('http://localhost:5173/pricing', 'One'));
      expect(new FeedbackStore(dir).list().map(i => i.comment)).toEqual(['One']);
      new FeedbackStore(dir).ask('P1-A1', 'Which one?');
      expect((await b.list())[0]).toMatchObject({ status: 'question', thread: [{ from: 'agent', text: 'Which one?' }] });
      expect((await b.change('P1-A1', { action: 'answer', text: 'The first' })).status).toBe('acknowledged');
      await expect(b.change('P9-A9', { action: 'reopen' })).rejects.toThrow(/No feedback item P9-A9/);
    } finally {
      await bridge.close();
    }
    await expect(bridgeBackend(bridge.url).list()).rejects.toThrow(/not reachable/);
  });
});
