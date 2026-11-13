/// <reference lib="dom" />
/**
 * The extension shell (M4.6): the production build asks for no more than activeTab, scripting and
 * storage; a test build loads in Chromium, puts the toolbar on a test site through the extension's
 * own scripting API, and keeps the user's settings in extension storage.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { serveSites } from '../../capture/test/browser.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WXT = fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url));

/** Build into a test folder: .output/ is the copy you may have loaded in Chrome, and stays untouched. */
function build(test: boolean): string {
  const outDir = test ? '.output-test' : '.output-check';
  const res = spawnSync(process.execPath, [WXT, 'build'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LUCI_EXTENSION_TEST: test ? '1' : '0', LUCI_EXTENSION_OUT_DIR: outDir } });
  if (res.status !== 0) throw new Error(`wxt build failed:\n${res.stdout}\n${res.stderr}`);
  return path.join(ROOT, outDir, 'chrome-mv3');
}
const manifest = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;

describe('extension build (M4.6)', { timeout: 120_000 }, () => {
  it('production asks only for activeTab, scripting, storage and debugger, and runs on no page by itself', () => {
    const m = manifest(build(false));
    expect(m['manifest_version']).toBe(3);
    expect(m['name']).toBe('Luci');
    expect(m['permissions']).toEqual(['activeTab', 'scripting', 'storage', 'debugger']);
    expect(m['host_permissions']).toBeUndefined();
    expect(m['content_scripts']).toBeUndefined();
    expect(m['background']).toEqual({ service_worker: 'background.js' });
  });
});

// Loading an unpacked extension hangs Chromium's start-up in some sandboxed environments (seen here
// with a one-line manifest too), so this suite runs only when asked: LUCI_EXTENSION_E2E=1 pnpm test.
describe.runIf(process.env['LUCI_EXTENSION_E2E'] === '1')('extension in Chromium (M4.6; LUCI_EXTENSION_E2E=1)', { timeout: 120_000 }, () => {
  let context: BrowserContext;
  let ext: Page;
  let extensionId: string;
  let server: Awaited<ReturnType<typeof serveSites>>;
  let userData: string;
  beforeAll(async () => {
    const dir = build(true);
    server = await serveSites();
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-ext-'));
    context = await chromium.launchPersistentContext(userData, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`]
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30_000 });
    extensionId = new URL(worker.url()).host;
    // The tests call extension APIs from the extension's own help page. Chrome stops an idle background
    // after about 30 seconds, so a handle on it goes stale; the page does not.
    ext = await context.newPage();
    await ext.goto(`chrome-extension://${extensionId}/help.html`);
  }, 120_000);
  afterAll(async () => {
    await context?.close();
    await server?.close();
    if (userData) fs.rmSync(userData, { recursive: true, force: true });
  });

  /** Run a function with the extension's APIs, failing after 20 seconds instead of hanging. */
  async function api<A, R>(fn: (arg: A) => Promise<R>, arg: A): Promise<R> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('extension API call timed out after 10s')), 10_000); });
    try {
      return await Promise.race([ext.evaluate(fn as never, arg as never) as Promise<R>, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Chrome = any;

  /** What the icon click does: run toolbar.js in the tab (the newest tab with this address). */
  const inject = (url: string) => api(async (pageUrl: string) => {
    const c = (globalThis as unknown as { chrome: Chrome }).chrome;
    const [tab] = ((await c.tabs.query({ url: pageUrl })) as { id: number }[]).sort((a, b) => b.id - a.id);
    await c.scripting.executeScript({ target: { tabId: tab!.id }, files: ['/toolbar.js'] });
  }, url);

  it('the "?" button opens the help page, through the background (which Chrome may have stopped meanwhile)', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    const [help] = await Promise.all([context.waitForEvent('page', { timeout: 20_000 }), page.click('[data-action="help"]')]);
    await help.waitForLoadState();
    expect(help.url()).toBe(`chrome-extension://${extensionId}/help.html`);
    expect(await help.locator('h1').innerText()).toBe('Capturing design with Luci');
    await help.close();
    await page.close();
  });

  it('puts the toolbar on the page, captures with it, keeps settings, and a second click closes it', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="text"]');
    await page.click('h1');
    await page.click('[data-output="one"]');
    expect(await page.locator('[data-part="preview"]').evaluate(el => ('value' in el ? (el as HTMLTextAreaElement).value : el.textContent) ?? '')).toContain('| font-size | 48px | `clamp(2rem, 2rem + 2vw, 3rem)` |  |');
    await page.selectOption('select[data-setting="units"]', 'rem');
    await expect.poll(() => api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      return ((await c.storage.local.get('captureSettings')) as Record<string, unknown>)['captureSettings'];
    }, null)).toEqual({ units: 'rem' });

    // The page's own scripts can't see the toolbar's state (it lives in the extension's isolated world)
    expect(await page.evaluate(() => '__luciToolbar' in window)).toBe(false);

    await inject(url);
    expect(await page.locator('luci-toolbar').count()).toBe(0);

    // Opened again after a reload, it starts with the saved settings
    await page.reload();
    await inject(url);
    await page.click('button[data-tool="text"]');
    await page.click('h1');
    await page.click('[data-output="one"]');
    expect(await page.locator('select[data-setting="units"]').inputValue()).toBe('rem');
    expect(await page.locator('[data-part="preview"]').evaluate(el => ('value' in el ? (el as HTMLTextAreaElement).value : el.textContent) ?? '')).toContain('| font-size | 3rem |');
    await page.close();
  });

  it('the basket lives in extension storage: an item added on one site is there on another (FR18)', async () => {
    const other = await serveSites('localhost');
    try {
      const a = await context.newPage();
      a.setDefaultTimeout(10_000);
      const urlA = `${server.origin}/css-variables/`;
      await a.goto(urlA);
      await inject(urlA);
      await a.click('button[data-tool="text"]');
      await a.click('h1');
      await a.click('[data-output="one"]');
      await a.click('[data-action="add-to-basket"]');
      const b = await context.newPage();
      b.setDefaultTimeout(10_000);
      const urlB = `${other.origin}/utility/`;
      await b.goto(urlB);
      await inject(urlB);
      await expect.poll(() => b.locator('[data-action="basket"]').innerText()).toBe('Basket (1)');
      await b.click('[data-action="basket"]');
      await b.click('[data-action="clear-basket"]');
      await b.click('[data-action="clear-basket-confirm"]');
      await a.close();
      await b.close();
    } finally {
      await other.close();
    }
  });

  it('a component capture reads exact states through the debugger, then detaches it (FR8)', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="component"]');
    await page.click('.button >> nth=0');
    await page.click('[data-output="one"]');
    const md = await page.locator('[data-part="preview"]').evaluate(el => ('value' in el ? (el as HTMLTextAreaElement).value : el.textContent) ?? '');
    expect(md).toMatch(/\| hover \| background-color #0f62fe → #0353e9 \| browser, state forced \|/);
    expect(md).toContain('| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |');
    // The debugger is detached again: a second attach from the test succeeds
    const attached = await api(async (pageUrl: string) => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      const [tab] = ((await c.tabs.query({ url: pageUrl })) as { id: number }[]).sort((a, b) => b.id - a.id);
      await c.debugger.attach({ tabId: tab!.id }, '1.3');
      await c.debugger.detach({ tabId: tab!.id });
      return true;
    }, url);
    expect(attached).toBe(true);
    await page.close();
  });

  it('Pixel mode reads colors from a screenshot of the tab; Luci\'s own panels are not picked (FR13)', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="color"]');
    await page.click('[data-color-mode="pixel"]');
    await page.locator('[data-part="pixel-layer"]').waitFor();
    const box = (await page.locator('.button').first().boundingBox())!;
    await page.mouse.move(box.x + 6, box.y + box.height / 2);
    await expect.poll(() => page.locator('[data-part="pixel-swatch"]').innerText()).toBe('#0f62fe');
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    expect(await page.locator('[data-part="preview"]').evaluate(el => ('value' in el ? (el as HTMLTextAreaElement).value : el.textContent) ?? '')).toContain('`--color-primary`');
    await page.close();
  });
});
