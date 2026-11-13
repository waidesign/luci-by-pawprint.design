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
import { chromium, type BrowserContext, type Worker } from 'playwright';
import { serveSites } from '../../capture/test/browser.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WXT = fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url));

function build(test: boolean): string {
  const res = spawnSync(process.execPath, [WXT, 'build'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LUCI_EXTENSION_TEST: test ? '1' : '0' } });
  if (res.status !== 0) throw new Error(`wxt build failed:\n${res.stdout}\n${res.stderr}`);
  return path.join(ROOT, test ? '.output-test' : '.output', 'chrome-mv3');
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
  let worker: Worker;
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
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30_000 });
  }, 120_000);
  afterAll(async () => {
    await context?.close();
    await server?.close();
    if (userData) fs.rmSync(userData, { recursive: true, force: true });
  });

  /** What the icon click does: the background script runs toolbar.js in the tab. */
  const inject = (url: string) => worker.evaluate(async (pageUrl: string) => {
    const c = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url: string }[]> }; scripting: { executeScript(o: object): Promise<unknown> } } }).chrome;
    const [tab] = await c.tabs.query({ url: pageUrl });
    await c.scripting.executeScript({ target: { tabId: tab!.id }, files: ['/toolbar.js'] });
  }, url);

  it('puts the toolbar on the page, captures with it, keeps settings, and a second click closes it', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="text"]');
    await page.click('h1');
    await page.click('[data-output="one"]');
    expect(await page.locator('[data-part="preview"]').textContent()).toContain('| font-size | 48px | `clamp(2rem, 2rem + 2vw, 3rem)` |  |');
    await page.selectOption('select[data-setting="units"]', 'rem');
    await expect.poll(() => worker.evaluate(async () => {
      const c = (globalThis as unknown as { chrome: { storage: { local: { get(k: string): Promise<Record<string, unknown>> } } } }).chrome;
      return (await c.storage.local.get('captureSettings'))['captureSettings'];
    })).toEqual({ units: 'rem' });

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
    expect(await page.locator('[data-part="preview"]').textContent()).toContain('| font-size | 3rem |');
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
    const md = (await page.locator('[data-part="preview"]').textContent()) ?? '';
    expect(md).toMatch(/\| hover \| background-color #0f62fe → #0353e9 \| browser, state forced \|/);
    expect(md).toContain('| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |');
    // The debugger is detached again: a second attach from the test succeeds
    const attached = await worker.evaluate(async (pageUrl: string) => {
      const c = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number }[]> }; debugger: { attach(t: object, v: string): Promise<void>; detach(t: object): Promise<void> } } }).chrome;
      const [tab] = await c.tabs.query({ url: pageUrl });
      await c.debugger.attach({ tabId: tab!.id }, '1.3');
      await c.debugger.detach({ tabId: tab!.id });
      return true;
    }, url);
    expect(attached).toBe(true);
  });
});
