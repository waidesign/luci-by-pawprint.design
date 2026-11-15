/// <reference lib="dom" />
/**
 * The design check (v0.3.1) in the capture toolbar, as the extension has it: the design comes from
 * the basket (or is pasted), the built component is picked on the page, and the differences are
 * copied as a prompt (the extension has no feedback notes). The fixture's built button differs from
 * the design in exactly three ways.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { captureBundle, launch, serveSites } from './browser.js';
import { THREE_DIFFERENCES } from './checkFixture.js';

let browser: Browser;
let server: Awaited<ReturnType<typeof serveSites>>;
let bundle: string;
beforeAll(async () => {
  [browser, server, bundle] = await Promise.all([launch(), serveSites(), captureBundle()]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.origin });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`${server.origin}/check/`);
  await page.addScriptTag({ content: bundle });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => { (window as any).LuciCapture.mountToolbar(); });
  return page;
}
const clipboard = async (page: Page) => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

describe('design check in the capture toolbar (v0.3.1)', { timeout: 60_000 }, () => {
  let page: Page;
  beforeAll(async () => { page = await open(); }, 60_000);
  afterAll(async () => { await page.context().close(); });

  it('checks the built button against a design in the basket: exactly the three differences, copied as a prompt', async () => {
    // The design: the reference button, captured and put in the basket
    await page.click('button[data-tool="component"]');
    await page.click('#design', { force: true });
    await page.click('[data-output="one"]');
    await page.locator('[data-part="preview"]').waitFor();
    await page.click('[data-action="add-to-basket"]');

    // Check: choose the design (no project here, so no saved files), then pick the built button
    await page.click('[data-action="check"]');
    expect(await page.locator('[data-action="check"]').getAttribute('aria-pressed')).toBe('true');
    await page.locator('[data-part="check-chooser"]').waitFor();
    expect(await page.locator('[data-part="check-saved"]').count()).toBe(0);
    await page.click('[data-part="check-basket"] [data-design-use]');
    expect(await page.locator('[data-part="hint"]').innerText()).toMatch(/^Click the component you built\. Luci checks it against Primary button \(button\) from 127\.0\.0\.1:\d+\.$/);
    // Luci compares while you pick the built one (brand/BRAND.md section 5)
    expect(await page.locator('[data-part="tool-hint"] .mascot').getAttribute('data-pose')).toBe('compare');
    await page.click('#built', { force: true });
    await page.locator('[data-part="check-selected"]').waitFor();
    await page.click('[data-action="check-run"]');
    await page.locator('[data-part="check-result"]').waitFor();

    expect(await page.locator('[data-part="check-summary"]').innerText()).toMatch(/^\d+ values match · 3 differences$/);
    expect(await page.locator('[data-difference] label span').allInnerTexts()).toEqual(THREE_DIFFERENCES);
    // The extension keeps no notes: the differences are copied as a prompt instead
    expect(await page.locator('[data-action="check-add"]').count()).toBe(0);
    await page.click('[data-action="check-copy"]');
    const report = await clipboard(page);
    expect(report).toMatch(/^# Design check: primary-button \(button\)\nBuilt: `[^`]+` on http:\/\/127\.0\.0\.1:\d+\/check\/\n/);
    expect(report).toContain('Make the built component match the design:\n1. Its border-radius is 4px');
    expect(report).toContain(`3. ${THREE_DIFFERENCES[2]}`);

    // Unticked differences stay out of the prompt
    await page.click('[data-difference="0"] input');
    await page.click('[data-action="check-copy"]');
    const two = await clipboard(page);
    expect(two).toContain('2 differences.');
    expect(two).not.toContain('border-radius');
  });

  it('the extension does not check again by itself unless asked (its states use the debugger)', async () => {
    expect(await page.locator('[data-action="check-watch"]').isChecked()).toBe(false);
  });

  it('the design itself matches; a pasted file that is not a component says what to pick', async () => {
    // Check another: the same design, now against the design button itself
    await page.click('[data-action="check-again"]');
    await page.click('#design', { force: true });
    await page.click('[data-action="check-run"]');
    await page.locator('[data-part="check-match"]').waitFor();
    expect(await page.locator('[data-part="check-summary"]').innerText()).toMatch(/· 0 differences$/);

    await page.click('[data-action="check-design"]');
    await page.fill('[data-part="check-paste"]', '---\nname: typography\nscope: system\ntype: typography\nsource: https://example.com/\ncaptured: 2026-11-14\nmethod: measured\n---\n\n## Roles\n\n## Families\n\n## Scale\n');
    await page.click('[data-action="check-paste-use"]');
    expect(await page.locator('[data-part="check-paste-error"]').innerText()).toContain('A design check needs a component file');
    // Esc closes the check
    await page.keyboard.press('Escape');
    await page.locator('[data-part="check-chooser"]').waitFor({ state: 'detached' });
  });
});

describe('automatic design check (v0.4)', { timeout: 60_000 }, () => {
  it('checks again when the page changes, says what changed, sends each run, and picks the check up after a reload', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const mount = async () => {
      await page.addScriptTag({ content: bundle });
      // The dev toolbar's way: check again from the start, and keep every run (here, on the page)
      await page.evaluate(() => {
        const w = window as unknown as { runs: unknown[]; LuciCapture: { mountToolbar(o: object): unknown } };
        w.runs = [];
        w.LuciCapture.mountToolbar({ autoCheck: true, onCheckRun: (run: unknown) => w.runs.push(run) });
      });
    };
    await page.goto(`${server.origin}/check/`);
    await mount();
    await page.click('button[data-tool="component"]');
    await page.click('#design', { force: true });
    await page.click('[data-output="one"]');
    await page.click('[data-action="add-to-basket"]');
    await page.click('[data-action="check"]');
    await page.click('[data-part="check-basket"] [data-design-use]');
    await page.click('#built', { force: true });
    await page.click('[data-action="check-run"]');
    await page.locator('[data-part="check-result"]').waitFor();
    expect(await page.locator('[data-action="check-watch"]').isChecked()).toBe(true);
    expect(await page.locator('[data-part="check-summary"]').innerText()).toMatch(/· 3 differences$/);

    // An edit fixes the radius (as a hot reload of the stylesheet would): Luci checks again by itself
    // (through the design's token: a plain 8px would still be "use var(--radius)")
    await page.addStyleTag({ content: '#built { border-radius: var(--radius); }' });
    await page.locator('[data-part="check-auto"]', { hasText: '2 differences' }).waitFor();
    expect(await page.locator('[data-part="check-auto"]').innerText()).toMatch(/^Checked again at .+: 2 differences \(was 3\)\.$/);
    expect(await page.locator('[data-part="check-summary"]').innerText()).toMatch(/· 2 differences$/);
    // Each run went to the project's side: the first check, then each re-check
    const runs = await page.evaluate(() => (window as unknown as { runs: { differences: unknown[]; selector: string; design: string }[] }).runs);
    expect(runs[0]!.differences.length).toBe(3);
    expect(runs.at(-1)!.differences.length).toBe(2);
    expect(runs.at(-1)).toMatchObject({ selector: expect.any(String), design: expect.stringMatching(/\.design\.md$/) });

    // A reload of the tab picks the watched check up again
    await page.reload();
    await mount();
    await page.locator('[data-part="check-result"]').waitFor();
    expect(await page.locator('[data-part="check-auto"]').innerText()).toBe('Checked again after the page reloaded.');
    // Switched off: the watch is forgotten
    await page.click('[data-action="check-watch"]');
    expect(await page.evaluate(() => sessionStorage.getItem('luci.autoCheck'))).toBeNull();
    await context.close();
  });
});
