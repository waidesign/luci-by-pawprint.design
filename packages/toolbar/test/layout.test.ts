/// <reference lib="dom" />
/**
 * Layout mode (user request, 2026-11-13), step 1, in the 3-page React app: change spacing, move and
 * resize existing elements on the live page, with snapping, undo, redo and reset; add the plan as a
 * note the agent gets as exact steps. React keeps working throughout (Luci never moves its DOM).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { FeedbackStore, initProject } from '@luci/brain';
import { SkillRegistry } from '@luci/skills';
import { handleTool } from '../../mcp/src/index.js';
import { startBridge, type Bridge } from '../../cli/src/serve/bridge.js';
import { serveApp, type AppServer } from '../../feedback/test/app.js';

let browser: Browser;
let app: AppServer;
let bundle: string;
let bridge: Bridge;
let dir: string;
const registry = new SkillRegistry({ user: false });

beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/script.ts', import.meta.url));
  const built = build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  [browser, app, bundle] = await Promise.all([chromium.launch(), serveApp(), built.then(r => r.outputFiles[0]!.text)]);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-layout-project-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop' }));
  await initProject(dir, { registry });
  bridge = await startBridge({ projectDir: dir, port: 0 });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await app?.close();
  await bridge?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function open(route: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = ${JSON.stringify(bridge.url)};\n${bundle}` });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(20_000);
  await page.goto(`${app.origin}${route}`);
  await page.locator('[data-mode="layout"]').waitFor();
  await page.click('[data-mode="layout"]');
  await page.locator('luci-layout [data-part="hint"]').waitFor({ timeout: 10_000 });
  return page;
}
const center = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
};
const base = async (page: Page) => Number(/(\d+)px scale/.exec(await page.locator('luci-layout [data-part="hint"]').innerText())![1]);

describe('Layout mode', { timeout: 90_000 }, () => {
  it('spacing, moving and undo on a flex navigation, previewed on the page; then a note with exact steps', async () => {
    const page = await open('/');
    const unit = await base(page);
    expect(unit).toBeGreaterThan(0);
    // Select a link, then its parent (the nav)
    await page.click('nav a:nth-of-type(1)', { force: true });
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('a (link) · Nav');
    await page.click('[data-action="select-parent"]');
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('nav (navigation) · Nav');

    // Gap +: previewed on the real page, snapped to the scale
    const gapBefore = await page.evaluate(() => getComputedStyle(document.querySelector('nav')!).columnGap);
    expect(gapBefore).toBe('12px');
    await page.click('[data-prop="gap"] [data-step="+"]');
    const planned = Math.round((12 + unit) / unit) * unit;
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('nav')!).columnGap)).toBe(`${planned}px`);
    expect(await page.locator('[data-part="changes"]').innerText()).toBe(`gap 12px → ${planned}px`);

    // Undo and redo
    await page.click('[data-action="undo"]');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('nav')!).columnGap)).toBe('12px');
    await page.click('[data-action="redo"]');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('nav')!).columnGap)).toBe(`${planned}px`);

    // Move "Checkout" before "Home": the nav is flex, so the page really reorders
    await page.click('[data-action="deselect"]');
    await page.click('nav a:nth-of-type(3)', { force: true });
    const handle = await center(page, '[data-handle="move"]');
    const home = await center(page, 'nav a:nth-of-type(1)');
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(home.box.x + 2, home.y, { steps: 6 });
    expect(await page.locator('[data-part="drop-line"]').count()).toBe(1);
    await page.mouse.up();
    const xs = await page.evaluate(() => [...document.querySelectorAll('nav a')].map(a => Math.round(a.getBoundingClientRect().left)));
    expect(xs[2]).toBeLessThan(xs[0]!);
    expect(await page.locator('[data-part="changes"]').innerText()).toBe('move it before `nav > a:nth-of-type(1)` (a): 3rd of 3 → 1st');

    // Add it as a note: saved in the project with the plan
    await page.fill('[data-part="why"]', 'Checkout is what most people come for');
    await page.click('[data-action="add-layout-note"]');
    await page.locator('[data-part="layout-added"]').waitFor();
    expect(await page.locator('[data-part="layout-added"]').innerText()).toMatch(/^Added P\d+-A\d+\./);
    const note = new FeedbackStore(dir).list().find(i => i.layout)!;
    expect(note).toMatchObject({ comment: 'Checkout is what most people come for', intent: 'change', target: { element: 'a (link)', text: 'Checkout', components: ['App', 'Layout', 'Nav'] } });
    expect(note.layout).toEqual({ viewport: { width: 1280, height: 800 }, changes: [{ op: 'move', position: 'before', sibling: { selector: 'nav > a:nth-of-type(1)', element: 'a' }, from: 3, to: 1, of: 3 }] });

    // The agent gets the steps
    const prompt = (await handleTool('get_feedback_prompt', {}, { registry, cwd: dir })).content[0]!.text;
    expect(prompt).toContain('  layout, planned in a 1280px wide window (keep it working at other widths):\n    - move it before `nav > a:nth-of-type(1)` (a): 3rd of 3 → 1st');

    // Reset puts the page back exactly; React still works (Luci never moved its DOM)
    await page.click('[data-action="reset"]');
    expect(await page.evaluate(() => [document.querySelectorAll('[data-luci-layout]').length, getComputedStyle(document.querySelector('nav')!).columnGap])).toEqual([0, '12px']);
    // Leave Layout mode (its pick layer covers the page while selecting), then use the app
    await page.click('luci-layout [data-mode="feedback"]');
    await page.locator('[data-action="annotate"]').waitFor();
    await page.click('nav a:text-is("Pricing")');
    await page.waitForFunction(() => location.pathname === '/pricing' && document.querySelector('h1')?.textContent?.includes('pricng'));
    await page.context().close();
  });

  it('resizing a card by its edge snaps to the scale; switching modes clears the preview', async () => {
    const page = await open('/pricing');
    const unit = await base(page);
    await page.click('.plan:nth-of-type(2) h2', { force: true });
    await page.click('[data-action="select-parent"]');
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('div · PlanCard');
    const before = (await page.locator('.plan:nth-of-type(2)').boundingBox())!.width;
    const edge = await center(page, '[data-handle="width"]');
    await drag(page, edge, { x: edge.x - 61, y: edge.y });
    const after = (await page.locator('.plan:nth-of-type(2)').boundingBox())!.width;
    expect(after % unit).toBe(0);
    expect(Math.abs(after - (before - 61))).toBeLessThanOrEqual(unit);
    expect(await page.locator('[data-part="changes"]').innerText()).toBe(`width as rendered ${Math.round(before * 100) / 100}px → ${after}px`);
    expect(await page.locator('[data-part="size-label"]').innerText()).toContain(`${after} ×`);
    // The parent is not flex: a card has no move handle preview there, but other values still work
    await page.click('[data-mode="feedback"]');
    await page.locator('[data-action="annotate"]').waitFor();
    const left = await page.evaluate(() => ({
      marked: [...document.querySelectorAll('[data-luci-layout]')].map(e => `${e.tagName}.${e.className}=${e.getAttribute('data-luci-layout')}`),
      layoutHost: Boolean(document.querySelector('luci-layout')),
      sheets: document.querySelectorAll('style[data-part="layout-preview"]').length
    }));
    expect(left).toEqual({ marked: [], layoutHost: false, sheets: 0 });
    expect(Math.round((await page.locator('.plan:nth-of-type(2)').boundingBox())!.width)).toBe(Math.round(before));
    await page.context().close();
  });
});
