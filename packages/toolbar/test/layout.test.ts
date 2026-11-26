/// <reference lib="dom" />
/**
 * Layout mode (FR32, changed 2026-11-13) in the 3-page React app: try layout changes on the live
 * page (8 handles, moves in flex rows and in plain stacks, size with min and max, margin and padding
 * per side, flex and grid), then copy them as one prompt (or add them to Feedback notes); either
 * puts the page back. React keeps working throughout (Luci never moves its DOM).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { DesignStore, FeedbackStore, initProject } from '@luci-dev/brain';
import { SkillRegistry } from '@luci-dev/skills';
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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = ${JSON.stringify(bridge.url)};\n${bundle}` });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
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
const css = (page: Page, sel: string, prop: string) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s!)!).getPropertyValue(p!), [sel, prop] as const);
const marked = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-luci-layout]').length);

describe('Layout mode', { timeout: 120_000 }, () => {
  it('Luci in each tool\'s pose: arranging for Select (brand/BRAND.md section 5)', async () => {
    const page = await open('/pricing');
    expect(await page.locator('luci-layout [data-part="hint"] .mascot').getAttribute('data-pose')).toBe('arrange');
    // Insert opens from the bar: just above it (bug report, 2026-11-15)
    await page.click('luci-layout [data-action="insert"]');
    // Measured once the panel has risen into place
    await page.waitForFunction(() => (document.querySelector('luci-layout')?.shadowRoot?.getAnimations() ?? [])
      .every(a => (a as CSSAnimation).animationName !== 'luci-rise' || a.playState !== 'running'));
    const [bar, panel] = await Promise.all([page.locator('luci-layout .bar').boundingBox(), page.locator('[data-part="inspector"]').boundingBox()]);
    expect(bar!.y - (panel!.y + panel!.height)).toBeGreaterThan(0);
    expect(bar!.y - (panel!.y + panel!.height)).toBeLessThan(24);
    await page.context().close();
  });

  it('a flex row: gap, undo, a real move; Copy prompt gives every change and puts the page back', async () => {
    const page = await open('/');
    const unit = await base(page);
    await page.click('nav a:nth-of-type(1)', { force: true });
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('a (link) · Nav');
    await page.click('[data-action="select-parent"]');
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('nav (navigation) · Nav');
    // The nav is flex: its children's layout shows, with gaps
    expect(await page.locator('[data-part="value-display"]').inputValue()).toBe('flex');
    await page.click('[data-prop="column-gap"] [data-step="+"]');
    const planned = Math.round((12 + unit) / unit) * unit;
    expect(await css(page, 'nav', 'column-gap')).toBe(`${planned}px`);
    expect(await page.locator('[data-part="changes"]').innerText()).toBe(`column-gap 12px → ${planned}px`);
    await page.click('[data-action="undo"]');
    expect(await css(page, 'nav', 'column-gap')).toBe('12px');
    await page.click('[data-action="redo"]');

    // Move "Checkout" before "Home"
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
    // Only the moved link gets a move step (its neighbors shifted, they did not move)
    expect(await page.locator('[data-part="changes"]').innerText()).toBe('move it before `nav > a:nth-of-type(1)` (a): 3rd of 3 → 1st');
    expect(await page.locator('[data-action="copy-layout-prompt"]').getAttribute('aria-label')).toBe('Copy prompt (2)');

    // Copy the plan with a note: one prompt, then the page is back
    await page.fill('[data-part="layout-note"]', 'Checkout is what most people come for');
    await page.click('[data-action="copy-layout-prompt-panel"]');
    const prompt = await page.locator('[data-part="layout-prompt"]').innerText();
    expect(prompt.split('\n')[0]).toBe('# Layout changes: /, 2 elements, 2 changes');
    expect(prompt).toContain('Note: "Checkout is what most people come for"');
    expect(prompt).toContain(`## 1. nav (navigation) · Nav  (src/components/Nav.jsx`);
    expect(prompt).toContain(`- column-gap 12px → ${planned}px`);
    expect(prompt).toContain('- move it before `nav > a:nth-of-type(1)` (a): 3rd of 3 → 1st');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').trimEnd()).toBe(prompt.trimEnd());
    expect(await page.locator('[data-part="layout-added"]').innerText()).toContain('The page is back');
    // And why: Layout mode previews, the code has not changed yet
    expect(await page.locator('[data-part="why-reset"]').innerText()).toContain('nothing in your code has changed yet');
    expect(await page.locator('[data-part="reset-note"]').innerText()).toContain('Your plan is safe in the');
    expect(await marked(page)).toBe(0);
    expect(await css(page, 'nav', 'column-gap')).toBe('12px');
    // Nothing went into the notes
    expect(new FeedbackStore(dir).list()).toEqual([]);

    // React still works: leave Layout mode, use the app
    await page.click('luci-layout [data-mode="feedback"]');
    await page.locator('[data-action="annotate"]').waitFor();
    await page.click('nav a:text-is("Pricing")');
    await page.waitForFunction(() => location.pathname === '/pricing');
    await page.context().close();
  });

  it('a plain stack: a move is shown by shifting; 8 handles, each side, min and max, grid; then Feedback notes', async () => {
    const page = await open('/pricing');
    const unit = await base(page);
    // Select the second card (via its heading, then the parent)
    await page.click('.plan:nth-of-type(2) h2', { force: true });
    await page.click('[data-action="select-parent"]');
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('div · PlanCard');
    expect(await page.locator('[data-handle]').count()).toBe(9);
    // The box model shows its margin and padding
    expect(await page.locator('[data-part="box-pad"]').count()).toBe(4);
    expect(await page.locator('[data-part="box-margin"]').count()).toBeGreaterThan(0);

    // Move it above the first card: the section is a plain block, so the cards shift
    const tops = () => page.evaluate(() => [...document.querySelectorAll('.plan')].map(p => Math.round(p.getBoundingClientRect().top)));
    const [t1, t2] = await tops();
    const handle = await center(page, '[data-handle="move"]');
    const first = await center(page, '.plan:nth-of-type(1)');
    await drag(page, handle, { x: first.x, y: first.box.y + 4 });
    const [n1, n2] = await tops();
    expect(n2).toBe(t1);
    expect(n1!).toBeGreaterThan(t2! - 40);
    expect(await page.locator('[data-part="move-note"]').count()).toBe(0);

    // The left handle widens it too, snapped to the scale
    const card = () => page.locator('.plan:nth-of-type(2)').boundingBox().then(b => b!);
    const was = await card();
    const before = was.width;
    const left = await center(page, '[data-handle="w"]');
    await drag(page, left, { x: left.x + 61, y: left.y });
    const now = await card();
    const after = now.width;
    expect(after % unit).toBe(0);
    expect(Math.abs(after - (before - 61))).toBeLessThanOrEqual(unit);
    // It changes on the side that was dragged: the right edge stays, the left edge follows the handle
    expect(Math.abs(now.x + now.width - (was.x + was.width))).toBeLessThan(1);
    expect(Math.abs(now.x - (was.x + 61))).toBeLessThanOrEqual(unit);
    expect(await page.locator('[data-part="changes"]').innerText()).toMatch(/width as rendered [\d.]+px → \d+px, shrinking from the left \(its right edge stays where it is\)/);
    // Dragged back past where it was, it grows to the left
    const left2 = await center(page, '[data-handle="w"]');
    await drag(page, left2, { x: left2.x - 81, y: left2.y });
    const grown = await card();
    expect(grown.width).toBeGreaterThan(before);
    expect(grown.x).toBeLessThan(was.x);
    expect(Math.abs(grown.x + grown.width - (was.x + was.width))).toBeLessThan(1);
    expect(await page.locator('[data-part="changes"]').innerText()).toContain(', growing to the left (its right edge stays where it is)');
    // The right handle: the left edge stays where it now is
    const right = await center(page, '[data-handle="e"]');
    await drag(page, right, { x: right.x - 40, y: right.y });
    const r2 = await card();
    expect(Math.abs(r2.x - grown.x)).toBeLessThan(1);
    expect(r2.width).toBeLessThan(grown.width);

    // Padding: one side, then all four together
    await page.click('[data-prop="padding-left"] [data-step="+"]');
    expect(await css(page, '.plan:nth-of-type(2)', 'padding-left')).toBe(`${16 + unit}px`);
    expect(await css(page, '.plan:nth-of-type(2)', 'padding-right')).toBe('16px');
    await page.click('[data-action="link-padding"]');
    await page.click('[data-prop="padding-top"] [data-step="+"]');
    expect(await page.evaluate(() => ['top', 'right', 'bottom', 'left'].map(s => getComputedStyle(document.querySelectorAll('.plan')[1]!).getPropertyValue(`padding-${s}`)))).toEqual(Array(4).fill(`${16 + unit}px`));
    // Max width, typed
    await page.fill('[data-part="value-max-width"]', '480');
    await page.press('[data-part="value-max-width"]', 'Enter');
    expect(await css(page, '.plan:nth-of-type(2)', 'max-width')).toBe('480px');
    // Max width is the size on screen too: the card is 480 wide, padding and border included
    expect(Math.round((await page.locator('.plan:nth-of-type(2)').boundingBox())!.width)).toBeLessThanOrEqual(480);
    const changes = await page.locator('[data-part="changes"]').innerText();
    expect(changes).toContain('max-width as rendered none → 480px');
    expect(changes).toContain(`padding-left 16px → ${16 + unit}px`);
    // The section holds the heading and the two cards: the card goes from 3rd to 2nd, before the first card
    expect(changes.split('\n')[0]).toBe('move it before `section > div:nth-of-type(1)` (div): 3rd of 3 → 2nd');

    // The section (heading and two cards) becomes a 3-column grid: everything sits in one row,
    // in the planned order (the move now shows with `order`)
    await page.click('[data-action="select-parent"]');
    expect(await page.locator('[data-part="inspector"] h2').innerText()).toBe('section (region) · Pricing');
    await page.selectOption('[data-part="value-display"]', 'grid');
    await page.fill('[data-part="value-columns"]', '3');
    await page.press('[data-part="value-columns"]', 'Enter');
    const lefts = await page.evaluate(() => [...document.querySelectorAll('.plan')].map(p => p.getBoundingClientRect().left));
    expect(lefts[1]!).toBeLessThan(lefts[0]!);
    const [a, b] = await page.evaluate(() => [...document.querySelectorAll('.plan')].map(p => p.getBoundingClientRect().top));
    expect(Math.abs(a! - b!)).toBeLessThan(2);
    expect(await page.locator('[data-part="changes"]').innerText()).toContain('grid columns');

    // Add the plan to Feedback notes: one note per element, and the page is back
    await page.fill('[data-part="layout-note"]', 'Plans side by side, Pro first');
    await page.click('[data-action="add-layout-notes"]');
    await page.locator('[data-part="layout-added"]').waitFor();
    expect(await page.locator('[data-part="layout-added"]').innerText()).toMatch(/^Added P\d+-A\d+, P\d+-A\d+ to Feedback notes/);
    expect(await marked(page)).toBe(0);
    const notes = new FeedbackStore(dir).list();
    expect(notes.map(n => [n.target.element, n.comment])).toEqual([['div', 'Plans side by side, Pro first'], ['section (region)', 'Plans side by side, Pro first']]);
    expect(notes[1]!.layout!.changes.map(c => c.op === 'set' && c.property)).toEqual(['display', 'grid-template-columns']);
    const prompt = (await handleTool('get_feedback_prompt', {}, { registry, cwd: dir })).content[0]!.text;
    expect(prompt).toContain('    - display block → grid');

    // Leaving Layout mode leaves the page as it was
    await page.click('luci-layout [data-mode="feedback"]');
    await page.locator('[data-action="annotate"]').waitFor();
    expect(await page.evaluate(() => ({ marked: document.querySelectorAll('[data-luci-layout]').length, sheets: document.querySelectorAll('style[data-part="layout-preview"]').length }))).toEqual({ marked: 0, sheets: 0 });
    await page.context().close();
  });

  it('a centered box grows only on the dragged side, left or right (CSS alone would grow it on both)', async () => {
    const page = await open('/pricing');
    await page.addStyleTag({ content: '.plan { width: 400px; margin-left: auto; margin-right: auto; }' });
    await page.click('.plan:nth-of-type(1) h2', { force: true });
    await page.click('[data-action="select-parent"]');
    const card = () => page.locator('.plan:nth-of-type(1)').boundingBox().then(b => b!);
    const was = await card();
    const left = await center(page, '[data-handle="w"]');
    await drag(page, left, { x: left.x - 40, y: left.y });
    const a = await card();
    expect(a.width).toBeGreaterThan(was.width + 30);
    expect(Math.abs(a.x + a.width - (was.x + was.width))).toBeLessThan(1);
    const right = await center(page, '[data-handle="e"]');
    await drag(page, right, { x: right.x + 40, y: right.y });
    const b = await card();
    expect(Math.abs(b.x - a.x)).toBeLessThan(1);
    expect(b.x + b.width).toBeGreaterThan(a.x + a.width + 30);
    // The top handle: the bottom edge stays
    const top = await center(page, '[data-handle="n"]');
    await drag(page, top, { x: top.x, y: top.y - 30 });
    const c = await card();
    expect(c.height).toBeGreaterThan(b.height + 20);
    expect(Math.abs(c.y + c.height - (b.y + b.height))).toBeLessThan(1);
    expect(await page.locator('[data-part="changes"]').innerText()).toContain(', growing upward (its bottom edge stays where it is)');
    await page.context().close();
  });

  it('Insert (step 2): another of your components, a saved capture and a block, placed, sized, labeled and copied', async () => {
    // A capture saved in the project shows in the catalog
    const card = fs.readFileSync(fileURLToPath(new URL('../../format/fixtures/capture/example-com.component.card.design.md', import.meta.url)), 'utf8');
    new DesignStore(dir).save('example-com.component.card.design.md', card);
    const page = await open('/pricing');
    const unit = await base(page);
    const rect = (sel: string) => page.locator(sel).boundingBox().then(b => b!);
    const plan2 = await rect('.plan:nth-of-type(2)');
    const section = await rect('main > section');

    await page.click('[data-action="insert"]');
    await page.locator('[data-part="insert-catalog"]').waitFor();
    // The page's own components, the most used first, each counted once per instance
    const comps = await page.locator('[data-group="components"] [data-insert]').allInnerTexts();
    expect(comps[0]).toBe('PlanCard ×2');
    // Then the smaller parts before the page's shell
    expect(comps.indexOf('Nav')).toBeLessThan(comps.indexOf('Pricing'));
    expect(comps.indexOf('Pricing')).toBeLessThan(comps.indexOf('App'));
    await page.locator('[data-insert="capture:example-com.component.card.design.md"]').waitFor();
    expect(await page.locator('[data-group="blocks"] [data-insert]').count()).toBe(10);

    // Another PlanCard, before the second one: the drop line and label say where
    await page.click('[data-insert="component:PlanCard"]');
    await page.locator('[data-part="placing"]').waitFor();
    expect(await page.locator('[data-part="placing-hint"] .mascot').getAttribute('data-pose')).toBe('place');
    await page.mouse.move(plan2.x + plan2.width / 2, plan2.y + 4);
    expect(await page.locator('[data-part="place-line"]').count()).toBe(1);
    expect(await page.locator('[data-part="place-label"]').innerText()).toBe('PlanCard: before div · PlanCard');
    await page.mouse.click(plan2.x + plan2.width / 2, plan2.y + 4);
    const ph = page.locator('[data-part="insert-placeholder"]');
    await ph.waitFor();
    // As big as a PlanCard (snapped), where the second card was; the card and the section make room
    const box = (await ph.boundingBox())!;
    expect(Math.abs(box.y - plan2.y)).toBeLessThan(1);
    expect(box.height % unit).toBe(0);
    expect(Math.abs(box.height - plan2.height)).toBeLessThanOrEqual(unit);
    const moved = await rect('.plan:nth-of-type(2)');
    expect(moved.y).toBeGreaterThan(plan2.y + box.height);
    expect((await rect('main > section')).height).toBeGreaterThan(section.height + box.height);
    expect(await page.locator('[data-part="insert-where"]').innerText()).toContain('Goes before div · PlanCard.');

    // Label it, make it taller with + and with the bottom handle, undo the last one
    await page.fill('[data-part="insert-label"]', 'Enterprise plan');
    await page.press('[data-part="insert-label"]', 'Enter');
    expect(await ph.innerText()).toContain('Enterprise plan');
    await page.click('[data-prop="insert-height"] [data-step="+"]');
    const taller = (await ph.boundingBox())!.height;
    expect(taller).toBe(box.height + unit);
    const bottom = await center(page, '[data-handle="insert-s"]');
    await drag(page, bottom, { x: bottom.x, y: bottom.y + 41 });
    expect(Math.abs((await ph.boundingBox())!.height - (taller + 41))).toBeLessThanOrEqual(unit);
    await page.keyboard.press('Control+z');
    expect((await ph.boundingBox())!.height).toBeLessThan(taller + 41 - unit);
    expect(await page.locator('[data-part="insert-inspector"] [data-part="changes"]').innerText()).toMatch(/^insert another `PlanCard` \(.*one is at `section > div:nth-of-type\(1\)`\) before it, \d+px wide, \d+px tall as rendered: "Enterprise plan"$/);

    // A saved capture, inside the section at the end: with the section selected, the place buttons
    await page.click('[data-action="deselect"]');
    await page.click('main > section > h1', { force: true });
    await page.click('[data-action="select-parent"]');
    await page.click('[data-action="insert"]');
    await page.click('[data-insert="capture:example-com.component.card.design.md"]');
    expect(await page.locator('[data-part="placing"] [data-place]').allInnerTexts()).toEqual(['Before', 'After', 'Inside, start', 'Inside, end']);
    await page.click('[data-part="placing"] [data-place="end"]');
    await expect.poll(() => ph.count()).toBe(2);
    expect(await page.locator('[data-part="insert-where"]').innerText()).toMatch(/^Saved capture · \.luci\/design\/example-com\.component\.card\.design\.md\. Goes inside, at the end of section/);

    // A block in the nav, a flex row: with the nav selected, Inside, end
    await page.click('[data-action="deselect"]');
    await page.click('nav a:nth-of-type(1)', { force: true });
    await page.click('[data-action="select-parent"]');
    const lastLink = await rect('nav a:nth-of-type(3)');
    await page.click('[data-action="insert"]');
    await page.click('[data-insert="block:button"]');
    await page.click('[data-part="placing"] [data-place="end"]');
    await expect.poll(() => ph.count()).toBe(3);
    const btn = (await page.locator('[data-part="insert-placeholder"]').nth(2).boundingBox())!;
    expect(btn.x).toBeGreaterThan(lastLink.x + lastLink.width);
    expect(Math.abs(btn.y - lastLink.y)).toBeLessThan(2);
    // In a row there is no full width
    expect(await page.locator('[data-action="insert-full-width"]').count()).toBe(0);

    // Copy: one prompt with all three; the page is back
    expect(await page.locator('[data-action="copy-layout-prompt"]').getAttribute('aria-label')).toBe('Copy prompt (3)');
    await page.click('[data-action="deselect"]');
    await page.click('[data-action="copy-layout-prompt-panel"]');
    const prompt = await page.locator('[data-part="layout-prompt"]').innerText();
    expect(prompt).toContain('Inserted parts are new');
    expect(prompt).toMatch(/- insert another `PlanCard` \(src\/components\/PlanCard\.jsx; one is at `section > div:nth-of-type\(1\)`\) before it, \d+px wide, \d+px tall as rendered: "Enterprise plan"/);
    expect(prompt).toContain('- insert a part like the saved capture "');
    expect(prompt).toContain('(.luci/design/example-com.component.card.design.md) inside it, at the end, 280px wide, 240px tall as rendered');
    expect(prompt).toMatch(/## \d\. nav \(navigation\) · Nav[^\n]*\n[\s\S]*- insert a new button inside it, at the end, 160px wide, 44px tall as rendered/);
    expect(await ph.count()).toBe(0);
    expect(await marked(page)).toBe(0);
    expect(Math.round((await rect('main > section')).height)).toBe(Math.round(section.height));

    // A part kept as a Feedback note: the agent's prompt has the step
    await page.click('[data-action="result-close"]');
    await page.click('[data-action="insert"]');
    await page.click('[data-insert="block:card grid"]');
    const h1 = await rect('main > section > h1');
    await page.mouse.click(h1.x + 20, h1.y + h1.height - 2);
    await ph.waitFor();
    // Full width in a top-to-bottom stack
    expect(Math.round((await ph.boundingBox())!.width)).toBe(Math.round(section.width));
    expect(await page.locator('[data-action="insert-full-width"]').getAttribute('aria-pressed')).toBe('true');
    await page.fill('[data-part="insert-label"]', 'Customer logos');
    await page.press('[data-part="insert-label"]', 'Enter');
    await page.click('[data-action="add-layout-notes"]');
    await page.locator('[data-part="layout-added"]').waitFor();
    const note = new FeedbackStore(dir).list().find(n => n.layout?.changes.some(c => c.op === 'insert'))!;
    expect(note.target.element).toBe('h1 (heading)');
    const agent = (await handleTool('get_feedback_prompt', {}, { registry, cwd: dir })).content[0]!.text;
    expect(agent).toContain('    - insert a new card grid after it, full width, 360px tall as rendered: "Customer logos"');
    await page.context().close();
  });

  it('New page (step 3): rows of parts, split, resized, labeled, undone; copied as a page prompt and kept as a note', async () => {
    new DesignStore(dir).save('example-com.component.card.design.md', fs.readFileSync(fileURLToPath(new URL('../../format/fixtures/capture/example-com.component.card.design.md', import.meta.url)), 'utf8'));
    const page = await open('/pricing');
    const unit = await base(page);
    const block = (name: string) => page.locator(`[data-block="${name}"]`);
    await page.click('[data-action="new-page"]');
    await page.locator('[data-part="sketch"]').waitFor();
    // The page plan's tools step aside while sketching
    expect(await page.locator('luci-layout [data-action="insert"]').count()).toBe(0);
    // A start: navigation, a section, a footer
    expect(await page.locator('[data-row]').count()).toBe(3);
    await page.fill('[data-part="wf-route"]', 'Enterprise plans');
    expect(await page.locator('[data-part="wf-summary"] h2').innerText()).toBe('New page /enterprise-plans');
    expect(await page.locator('[data-part="sketch-hint"] .mascot').getAttribute('data-pose')).toBe('sketch');

    // Row 1 is the app's own Nav
    await block('1a').click();
    await page.click('[data-action="wf-choose"]');
    await page.click('[data-part="wf-catalog"] [data-insert="component:Nav"]');
    await expect.poll(() => page.locator('[data-part="wf-what"]').innerText()).toBe('Your component: Nav · src/components/Nav.jsx');

    // Row 2 split in two: text on the left, an image slot on the right
    await block('1a').click();
    await page.locator('[data-block="2a"]').click();
    await page.click('[data-action="wf-split"]');
    expect(await page.locator('[data-part="wf-inspector"] h2').innerText()).toBe('Part 2b');
    await page.click('[data-action="wf-choose"]');
    await page.click('[data-part="wf-catalog"] [data-insert="block:image slot"]');
    await page.fill('[data-part="wf-label"]', 'Team dashboard screenshot');
    await page.press('[data-part="wf-label"]', 'Enter');
    await block('2a').click();
    await page.click('[data-action="wf-choose"]');
    await page.click('[data-part="wf-catalog"] [data-insert="block:text"]');
    await page.fill('[data-part="wf-label"]', 'Headline, pitch, Talk to sales');
    await page.press('[data-part="wf-label"]', 'Enter');
    // Undo and redo the label
    await page.click('[data-action="wf-undo"]');
    expect(await block('2a').innerText()).not.toContain('Headline');
    await page.click('[data-action="wf-redo"]');
    expect(await block('2a').innerText()).toContain('Headline');

    // The line between them: the text gets 2/3 of the row
    const a = (await block('2a').boundingBox())!;
    const b = (await block('2b').boundingBox())!;
    const line = await center(page, '[data-divider="2-1"]');
    await drag(page, line, { x: a.x + (b.x + b.width - a.x) * (2 / 3), y: line.y });
    expect(await block('2a').innerText()).toContain('2/3');
    expect(await block('2b').innerText()).toContain('1/3');
    // The row's bottom handle: taller, snapped
    const before = (await page.locator('[data-row="2"]').boundingBox())!.height;
    const handle = await center(page, '[data-row-handle="2"]');
    await drag(page, handle, { x: handle.x, y: handle.y + 41 });
    const after = (await page.locator('[data-row="2"]').boundingBox())!.height;
    expect(after % unit).toBe(0);
    expect(Math.abs(after - before - 41)).toBeLessThanOrEqual(unit);

    // A new row below row 2, from a saved capture
    await block('2a').click();
    await page.click('[data-action="wf-row-below"]');
    expect(await page.locator('[data-row]').count()).toBe(4);
    await page.click('[data-action="wf-choose"]');
    await page.click('[data-part="wf-catalog"] [data-insert="capture:example-com.component.card.design.md"]');
    await page.fill('[data-part="wf-label"]', 'Customer quote');
    await page.press('[data-part="wf-label"]', 'Enter');

    // Copy the page prompt
    await page.keyboard.press('Escape');
    await page.fill('[data-part="wf-note"]', 'For teams of 50 and more');
    await page.click('[data-action="wf-copy"]');
    const prompt = await page.locator('[data-part="wf-prompt"]').innerText();
    expect(prompt.split('\n')[0]).toBe('# New page: /enterprise-plans, 4 parts');
    expect(prompt).toContain('over /pricing');
    expect(prompt).toContain('Note: "For teams of 50 and more"');
    expect(prompt).toMatch(/\n1\. Full width, about 64px tall: the `Nav` component \(src\/components\/Nav\.jsx; one is at `[^`]+`\)\n/);
    expect(prompt).toMatch(/\n2\. A row of 2 side by side, about \d+px tall:\n   - 2a\. 2\/3 of the width: a new text: "Headline, pitch, Talk to sales"\n   - 2b\. 1\/3 of the width: a new image slot: "Team dashboard screenshot"\n/);
    expect(prompt).toMatch(/\n3\. Full width, about 240px tall: a part like the saved capture "[^"]+" \(\.luci\/design\/example-com\.component\.card\.design\.md\): "Customer quote"\n/);
    expect(prompt).toContain('\n4. Full width, about 160px tall: a new footer\n');
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').trimEnd()).toBe(prompt.trimEnd());

    // Keep it as a Feedback note: the agent's prompt holds the sketch
    await page.click('[data-action="wf-result-close"]');
    await page.click('[data-action="wf-notes"]');
    await page.locator('[data-part="wf-added"]').waitFor();
    expect(await page.locator('[data-part="wf-added"]').innerText()).toMatch(/^Added P\d+-A\d+ to Feedback notes/);
    const note = new FeedbackStore(dir).list().find(n => n.wireframe)!;
    expect(note.wireframe!.route).toBe('/enterprise-plans');
    expect(note.wireframe!.rows.map(r => r.blocks.map(x => x.span))).toEqual([[12], [8, 4], [12], [12]]);
    const agent = (await handleTool('get_feedback_prompt', {}, { registry, cwd: dir })).content[0]!.text;
    expect(agent).toContain('  new page /enterprise-plans, sketched in a 1280px wide window');
    expect(agent).toContain('       - 2a. 2/3 of the width: a new text: "Headline, pitch, Talk to sales"');

    // Back to the page: the app is as it was
    await page.click('[data-action="wf-close"]');
    expect(await page.locator('[data-part="sketch"]').count()).toBe(0);
    await page.locator('luci-layout [data-action="insert"]').waitFor();
    expect(await marked(page)).toBe(0);
    await page.context().close();
  });

  it('batches drag moves, clears kept translation on undo, and clamps resize (B-62)', async () => {
    const page = await open('/pricing');
    await page.addStyleTag({ content: '.plan { width: 400px; margin-left: auto; margin-right: auto; }' });
    await page.click('.plan:nth-of-type(1) h2', { force: true });
    await page.click('[data-action="select-parent"]');
    const card = () => page.locator('.plan:nth-of-type(1)').boundingBox().then(b => b!);
    const was = await card();
    const left = await center(page, '[data-handle="w"]');
    await drag(page, left, { x: left.x - 40, y: left.y });
    const dragged = await card();
    expect(dragged.width).toBeGreaterThan(was.width + 30);
    // 1 undo restores original width
    await page.click('[data-action="undo"]');
    const undone = await card();
    expect(undone.width).toBeCloseTo(was.width, 0);
    // And no kept translate rule remains
    const previewStyle = await page.evaluate(() => document.querySelector('style[data-part="layout-preview"]')?.textContent || '');
    expect(previewStyle).not.toContain('translate');
    // Further undo is disabled (only 1 step was created)
    expect(await page.locator('[data-action="undo"]').isDisabled()).toBe(true);
    await page.context().close();
  });

  it('unwraps stepper buttons from labels in layout inspector (B-63)', async () => {
    const page = await open('/pricing');
    await page.click('.plan:nth-of-type(1) h2', { force: true });
    // Click "top" label text
    const topValBefore = await page.locator('[data-part="value-margin-top"]').inputValue();
    await page.click('.side-cell label:has-text("top")');
    const focused = await page.evaluate(() => (document.querySelector('luci-layout')?.shadowRoot?.activeElement as HTMLElement | null)?.dataset?.part || (document.activeElement as HTMLElement | null)?.dataset?.part);
    expect(focused).toBe('value-margin-top');
    expect(await page.locator('[data-part="value-margin-top"]').inputValue()).toBe(topValBefore);
    await page.context().close();
  });

  it('steps max-width from rendered size, allows negative margin stepping, and closes settings on escape (B-64)', async () => {
    const page = await open('/pricing');
    await page.click('.plan:nth-of-type(1) h2', { force: true });
    // Click + on max-width (currently none)
    expect(await page.locator('[data-part="value-max-width"]').inputValue()).toBe('none');
    const renderedWidth = await page.evaluate(() => Math.round(document.querySelector('.plan:nth-of-type(1) h2')!.getBoundingClientRect().width / 4) * 4);
    await page.click('[data-prop="max-width"] [data-step="+"]');
    expect(await page.locator('[data-part="value-max-width"]').inputValue()).toBe(String(renderedWidth + 4));

    // Negative margin stepping
    await page.fill('[data-part="value-margin-left"]', '-8');
    await page.click('[data-prop="margin-left"] [data-step="-"]');
    expect(await page.locator('[data-part="value-margin-left"]').inputValue()).toBe('-12');

    // Layout Settings closes on Escape
    await page.click('[data-action="settings"]');
    await page.locator('[data-part="settings"]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-part="settings"]').waitFor({ state: 'detached' });

    await page.context().close();
  });
});
