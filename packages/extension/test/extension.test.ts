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
  let prodDir: string;
  beforeAll(() => {
    prodDir = build(false);
  });
  afterAll(() => {
    fs.rmSync(path.join(ROOT, '.output-check'), { recursive: true, force: true });
  });

  it('production asks only for activeTab, scripting, storage and debugger, and runs on no page by itself', () => {
    const m = manifest(prodDir);
    expect(m['manifest_version']).toBe(3);
    expect(m['name']).toBe('Luci');
    expect(m['description']).toBe('Capture the exact design of your running app for your AI coding agent. Everything stays on your machine.');
    expect(m['permissions']).toEqual(['activeTab', 'scripting', 'storage', 'debugger']);
    // Chrome does not allow debugger as an optional permission
    expect(m['optional_permissions']).toBeUndefined();
    expect(m['host_permissions']).toEqual(['http://127.0.0.1/*', 'http://localhost/*']);
    expect(m['content_scripts']).toBeUndefined();
    expect(m['background']).toEqual({ service_worker: 'background.js' });
  });

  it('bundles direct extension bridge handlers for saving captures to project and checking health', () => {
    const bg = fs.readFileSync(path.join(prodDir, 'background.js'), 'utf8');
    expect(bg).toContain('luci:save-to-project');
    expect(bg).toContain('luci:check-bridge');
    expect(bg).toContain('luci:list-captures');
    expect(bg).toContain('luci:read-capture');
    expect(bg).toContain('luci:propose-rule');
    expect(bg).toContain('/design');
    expect(bg).toContain('/health');
    const tb = fs.readFileSync(path.join(prodDir, 'toolbar.js'), 'utf8');
    expect(tb).toContain('luci:save-to-project');
    expect(tb).toContain('Download file instead');
  });

  it('the help page explains the required debugger permission and Luci\'s switch, with no request or remove buttons', () => {
    const bg = fs.readFileSync(path.join(prodDir, 'background.js'), 'utf8');
    expect(bg).toContain('luci:check-debugger');
    const help = fs.readFileSync(path.join(prodDir, 'help.html'), 'utf8');
    expect(help).toContain('npm install -g @luci-dev/cli');
    expect(help).toContain('id="debugger-permission"');
    expect(help).toContain('dbg-status-text');
    expect(help).not.toContain('dbg-request-btn');
    expect(help).not.toContain('dbg-remove-btn');
    const start = help.indexOf('id="debugger-permission"');
    const section = help.slice(start, help.indexOf('<h2', start));
    expect(section.toLowerCase()).not.toContain('optional');
    expect(section).toContain('debugger warning');
    expect(section).toContain("Luci's switch");
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
    fs.rmSync(path.join(ROOT, '.output-test'), { recursive: true, force: true });
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

  it('fresh install shows start view with Capture and Team Feedback tabs and guide, Reviewer saves notes across reload, and tab switching works', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);

    // 1. Fresh install shows the toolbar directly with Capture and Team Feedback tabs + start guide below the bar
    await page.locator('[data-part="modes"]').waitFor();
    expect(await page.locator('[data-part="modes"] button[data-mode="capture"]').innerText()).toBe('Capture');
    expect(await page.locator('[data-part="modes"] button[data-mode="reviewer"]').innerText()).toBe('Team Feedback');
    await page.locator('[data-part="start-guide"]').waitFor();
    expect(await page.locator('[data-part="start-guide"]').innerText()).toContain('Capture');
    expect(await page.locator('[data-part="start-guide"]').innerText()).toContain('Team Feedback');
    // Each mode has its own Luci (BRAND.md section 5, mode table)
    expect(await page.locator('[data-part="start-guide"] .mascot').getAttribute('data-pose')).toBe('frame');

    // 2. Switch to "Team Feedback" -> Reviewer tab opens and asks for identity
    await page.click('[data-mode="reviewer"]');
    await page.locator('[data-part="reviewer-identity"]').waitFor();
    expect(await page.locator('[data-guide="feedback"] .mascot').getAttribute('data-pose')).toBe('listen');
    expect(await page.locator('[data-part="modes"]').count()).toBe(1); // Tabs remain accessible in the bar
    await page.fill('[data-part="reviewer-name"]', 'Maya');
    await page.click('[data-part="reviewer-role"] button[data-role="PM"]');
    await page.click('[data-action="save-identity"]');

    // 3. Click an element to leave a note (Simple mode hides CSS values)
    await page.click('h1', { force: true, position: { x: 30, y: 10 } });
    await page.locator('[data-part="reviewer-note-form"]').waitFor();
    expect(await page.locator('[data-part="note-author"]').innerText()).toBe('Maya · PM');
    await page.fill('[data-part="reviewer-comment"]', 'Heading feels too close to top');
    await page.click('[data-action="save-review-note"]');

    // 4. Reload page & re-inject: remembered Reviewer tab + saved note survive reload
    await page.reload();
    await inject(url);
    await page.locator('[data-reviewer-marker="1"]').waitFor();
    // The marker sits on the spot that was clicked, not the heading's top-right corner (bug, 2026-11-26)
    const [m, h] = await Promise.all([page.locator('[data-reviewer-marker="1"]').boundingBox(), page.locator('h1').boundingBox()]);
    expect(Math.abs(m!.x + m!.width / 2 - (h!.x + 30))).toBeLessThan(2);
    expect(Math.abs(m!.y + m!.height / 2 - (h!.y + 10))).toBeLessThan(2);
    await page.click('[data-action="review"]');
    await page.locator('[data-part="review-panel"]').waitFor();
    const reviewText = await page.locator('[data-part="review-text"]').inputValue();
    expect(reviewText).toContain('Luci Review — Maya (PM)');
    expect(reviewText).toContain('Heading feels too close to top');
    expect(reviewText).toContain('```luci-review');
    // No paste box on Reviewer side
    expect(await page.locator('[data-part="builder-paste"]').count()).toBe(0);

    // 5. Switch to Capture tab & verify it is remembered
    await page.click('[data-mode="capture"]');
    await page.locator('button[data-tool="text"]').waitFor();

    // Clean up reviewer notes so subsequent tests start cleanly in Capture mode
    await api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      await c.storage.local.remove(['reviewerNotesByOrigin', 'reviewerIdentity', 'reviewerSimpleMode', 'extensionTab']);
    }, null);
    await page.close();
  });

  it('existing users with saved Capture settings default directly to Capture', async () => {
    await api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      await c.storage.local.remove('extensionTab');
      await c.storage.local.set({ captureSettings: { units: 'px' } });
    }, null);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.locator('button[data-tool="text"]').waitFor();
    expect(await page.locator('[data-part="modes"] button[data-mode="capture"]').innerText()).toBe('Capture');
    expect(await page.locator('[data-part="modes"] button[data-mode="reviewer"]').innerText()).toBe('Team Feedback');
    await api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      await c.storage.local.remove('captureSettings');
    }, null);
    await page.close();
  });

  it('the "?" button opens the help page, through the background (which Chrome may have stopped meanwhile)', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('[data-action="settings"]');
    const [help] = await Promise.all([context.waitForEvent('page', { timeout: 20_000 }), page.click('[data-action="help"]')]);
    await help.waitForLoadState();
    expect(help.url()).toBe(`chrome-extension://${extensionId}/help.html`);
    expect(await help.locator('h1').innerText()).toBe('Capturing design with Luci');
    await help.close();
    await page.close();
  });

  it("the help page's debugger status follows Luci's switch in settings (the permission itself is required)", async () => {
    const status = () => ext.locator('#dbg-status-text').innerText();
    await expect.poll(status).toBe("Luci's switch is on: Luci uses the debugger during captures.");
    await api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      await c.storage.local.set({ captureSettings: { useDebugger: false } });
    }, null);
    await expect.poll(status).toBe("Luci's switch is off: Luci never attaches the debugger.");
    expect(await ext.locator('#dbg-dot').getAttribute('class')).toBe('status-dot offline');
    await api(async () => {
      const c = (globalThis as unknown as { chrome: Chrome }).chrome;
      await c.storage.local.remove('captureSettings');
    }, null);
    await expect.poll(status).toBe("Luci's switch is on: Luci uses the debugger during captures.");
    expect(await ext.locator('#dbg-request-btn, #dbg-remove-btn').count()).toBe(0);
  });

  it('puts the toolbar on the page, captures with it, keeps settings, and a second click closes it', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const url = `${server.origin}/css-variables/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="text"]');
    await page.click('h1', { force: true });
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
    await page.click('h1', { force: true });
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
      await a.click('h1', { force: true });
      await a.click('[data-output="one"]');
      await a.click('[data-action="add-to-basket"]');
      const b = await context.newPage();
      b.setDefaultTimeout(10_000);
      const urlB = `${other.origin}/utility/`;
      await b.goto(urlB);
      await inject(urlB);
      await expect.poll(() => b.locator('[data-action="basket"]').innerText()).toBe('Basket 1');
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
    await page.click('.button >> nth=0', { force: true });
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

  it('responsive capture resizes the tab through the debugger for each width, then puts it back and detaches (v0.3.4)', async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const url = `${server.origin}/responsive/`;
    await page.goto(url);
    await inject(url);
    await page.click('button[data-tool="component"]');
    await page.click('#pricing > h2', { force: true });
    await page.click('[data-action="widen"]');
    await page.click('[data-output="section"]');
    await page.click('[data-action="responsive"]');
    await page.locator('[data-part="responsive-note"]').waitFor();
    const md = await page.locator('[data-part="preview"]').evaluate(el => (el as HTMLTextAreaElement).value);
    expect(md).toContain('| Part | Property | 375px | 768px | 1280px |');
    expect(md).toMatch(/\| \S+ \| grid-template-columns \| 1 column \| 2 columns \| 3 columns \|/);
    // Read in the tab itself, not in frames, and the tab is put back. Its exact width can't be compared
    // here: Playwright's own viewport is a debugger resize too, and Luci's reset clears it with its own
    // (in Chrome, without Playwright, the width comes back exactly). So: not left at a narrow width read,
    // and the debugger is free again below (Chrome removes Luci's resize when it detaches)
    expect(await page.locator('[data-part="responsive-note"]').innerText()).not.toContain('hidden frame');
    expect([375, 768]).not.toContain(await page.evaluate(() => innerWidth));
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
