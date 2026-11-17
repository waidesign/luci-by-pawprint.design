/// <reference lib="dom" />
/**
 * The dev toolbar on a phone (user report, 2026-11-17): the bar takes two planned rows instead of
 * wrapping anywhere, cards open past its measured height instead of under it, tooltips do not stick
 * after a tap, and picking an element works by touch.
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { serveApp, type AppServer } from '../../feedback/test/app.js';

let browser: Browser;
let app: AppServer;
let bundle: string;
beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/script.ts', import.meta.url));
  const built = build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  [browser, app, bundle] = await Promise.all([chromium.launch(), serveApp(), built.then(r => r.outputFiles[0]!.text)]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await app?.close();
});

const PHONE = { width: 375, height: 667 };

/** A phone: small viewport, touch screen, no hover. Without luci serve, notes stay in the browser. */
async function phone(): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  // A mobile site's viewport tag (the test app has none, so the phone would lay it out 980 px wide)
  await ctx.addInitScript({ content: `document.addEventListener('DOMContentLoaded', () => {
    const m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1'; document.head.prepend(m);
  }, { once: true });` });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = "http://127.0.0.1:9";\n${bundle}` });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(20_000);
  await page.goto(`${app.origin}/pricing`);
  await page.locator('[data-action="annotate"]').waitFor();
  return { ctx, page };
}

/** A box once cards have risen into place. */
async function box(page: Page, sel: string) {
  await page.waitForFunction(() => ['luci-feedback', 'luci-layout', 'luci-toolbar'].every(tag => (document.querySelector(tag)?.shadowRoot?.getAnimations() ?? [])
    .every(a => !/^luci-(rise|drop)$/.test((a as CSSAnimation).animationName ?? '') || a.playState !== 'running')));
  return (await page.locator(sel).first().boundingBox())!;
}

describe('dev toolbar on a phone', { timeout: 60_000 }, () => {
  it('spans the width in two rows in every mode, and its cards open above it', async () => {
    const { ctx, page } = await phone();
    for (const [mode, tag, firstTool] of [['feedback', 'luci-feedback', '[data-action="annotate"]'], ['layout', 'luci-layout', '[data-action="select"]'], ['capture', 'luci-toolbar', '[data-tool="component"]']] as const) {
      if (mode !== 'feedback') await page.locator(`${tag === 'luci-layout' ? 'luci-feedback' : 'luci-layout'} [data-mode="${mode}"]`).tap();
      const bar = await box(page, `${tag} .bar`);
      // Full width, 8 px from each edge
      expect(Math.round(bar.x), mode).toBe(8);
      expect(Math.round(PHONE.width - (bar.x + bar.width)), mode).toBe(8);
      // Row 1: Luci, the modes and Close; row 2: the tools. Two rows, no third
      const luci = await box(page, `${tag} .menu-btn`);
      const close = await box(page, `${tag} [data-action="close"]`);
      const tool = await box(page, `${tag} ${firstTool}`);
      expect(Math.abs(close.y - luci.y), mode).toBeLessThan(8);
      expect(tool.y, mode).toBeGreaterThan(luci.y + luci.height - 4);
      expect(bar.height, mode).toBeLessThan(120);
      // Every button stays a 44 px touch target
      expect(tool.width, mode).toBeGreaterThanOrEqual(44);
      // The host carries the bar's real height, which cards use to open past it
      const barH = await page.evaluate(t => (document.querySelector(t) as HTMLElement).style.getPropertyValue('--luci-bar-h'), tag);
      expect(barH, mode).toBe(`${Math.round(bar.height)}px`);
    }
    // Feedback's description is above the bar, not under it
    await page.locator('luci-toolbar [data-mode="feedback"]').tap();
    const bar = await box(page, 'luci-feedback .bar');
    const intro = await box(page, 'luci-feedback [data-part="intro"]');
    expect(intro.y + intro.height).toBeLessThan(bar.y);
    expect(intro.x).toBeGreaterThanOrEqual(8);
    expect(intro.x + intro.width).toBeLessThanOrEqual(PHONE.width - 8);
    await ctx.close();
  });

  it('shows no tooltip after a tap: touch screens have no hover', async () => {
    const { ctx, page } = await phone();
    await page.locator('luci-feedback [data-action="pause"]').tap();
    // Past the tooltip's 300 ms delay and its fade
    await page.waitForTimeout(700);
    const tip = await page.evaluate(() => {
      const b = document.querySelector('luci-feedback')!.shadowRoot!.querySelector('[data-action="pause"]')!;
      return getComputedStyle(b, '::after').opacity;
    });
    expect(tip).toBe('0');
    await ctx.close();
  });

  it('annotates by touch: a first tap outlines the element, Add note or a second tap opens the note', async () => {
    const { ctx, page } = await phone();
    await page.locator('luci-feedback [data-action="annotate"]').tap();
    const highlight = page.locator('luci-feedback .highlight');
    const form = page.locator('luci-feedback [data-part="note-form"]');
    // First tap: outlined and named, no form yet (nothing showed it before, a finger has no hover)
    await page.locator('h1').tap({ force: true });
    await highlight.waitFor();
    expect(await page.locator('luci-feedback [data-part="hover-label"]').innerText()).toContain('h1');
    expect(await page.locator('luci-feedback [data-part="tapped-name"]').innerText()).toContain('h1');
    expect(await form.count()).toBe(0);
    // Parent widens the choice to the section
    await page.locator('luci-feedback [data-action="tap-parent"]').tap();
    expect(await page.locator('luci-feedback [data-part="tapped-name"]').innerText()).toContain('section');
    // Add note opens the form on it
    await page.locator('luci-feedback [data-action="note-tapped"]').tap();
    await form.waitFor();
    expect(await form.locator('h3').innerText()).toContain('section');
    await page.locator('luci-feedback [data-action="cancel-note"]').tap();
    // A second tap on the same element opens the form too
    await page.locator('h1').tap({ force: true });
    await page.locator('h1').tap({ force: true });
    await form.waitFor();
    expect(await form.locator('h3').innerText()).toContain('h1');
    await ctx.close();
  });

  it('opens a note as a sheet just above the bar, with intent and priority as one-tap choices', async () => {
    const { ctx, page } = await phone();
    await page.locator('luci-feedback [data-action="pause"]').tap();
    await page.locator('luci-feedback [data-action="annotate"]').tap();
    await page.locator('h1').tap({ force: true });
    await page.locator('h1').tap({ force: true });
    const form = await box(page, 'luci-feedback [data-part="note-form"]');
    const bar = await box(page, 'luci-feedback .bar');
    expect(Math.round(form.x)).toBe(8);
    expect(Math.round(PHONE.width - (form.x + form.width))).toBe(8);
    expect(bar.y - (form.y + form.height)).toBeGreaterThanOrEqual(0);
    expect(bar.y - (form.y + form.height)).toBeLessThan(16);
    // The paused card steps aside instead of sitting under the sheet
    expect(await page.locator('luci-feedback [data-part="paused"]').isVisible()).toBe(false);
    // No native select (its list opens away from the form on some phones): buttons, one tap each
    expect(await page.locator('luci-feedback [data-part="note-form"] select').count()).toBe(0);
    await page.locator('luci-feedback [data-part="comment"]').fill('Too tight on a phone');
    await page.locator('luci-feedback [data-part="intent"] [data-value="question"]').tap();
    await page.locator('luci-feedback [data-part="priority"] [data-value="high"]').tap();
    expect(await page.locator('luci-feedback [data-part="intent"] [aria-pressed="true"]').innerText()).toBe('question');
    await page.locator('luci-feedback [data-action="save-note"]').tap();
    await page.locator('luci-feedback [data-part="note-form"]').waitFor({ state: 'detached' });
    // The saved note opens as a sheet too, with what was chosen
    await page.locator('luci-feedback [data-marker]').first().tap();
    expect(await page.locator('luci-feedback [data-part="note-meta"]').innerText()).toContain('question · high priority');
    const item = await box(page, 'luci-feedback [data-part="item"]');
    expect(Math.round(item.x)).toBe(8);
    await ctx.close();
  });

  it('scrolls the page under the finger while annotating', async () => {
    const { ctx, page } = await phone();
    await page.evaluate(() => { document.body.style.minHeight = '3000px'; });
    await page.locator('luci-feedback [data-action="annotate"]').tap();
    await page.locator('luci-feedback [data-part="pick-layer"]').waitFor();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.synthesizeScrollGesture', { x: 180, y: 300, yDistance: -300, gestureSourceType: 'touch', speed: 1200 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await ctx.close();
  });

  it('picks by touch in Capture and Layout too: see it with one tap, take it with a second', async () => {
    const { ctx, page } = await phone();
    // Capture: the first tap aims, the second takes the element
    await page.locator('luci-feedback [data-mode="capture"]').tap();
    await page.locator('luci-toolbar [data-tool="text"]').tap();
    await page.locator('h1').tap({ force: true });
    await page.locator('luci-toolbar .highlight').waitFor();
    expect(await page.locator('luci-toolbar [data-part="pick-layer"]').count()).toBe(1);
    await page.locator('h1').tap({ force: true });
    await page.locator('luci-toolbar [data-part="pick-layer"]').waitFor({ state: 'detached' });
    // Layout: the first tap outlines, the second selects
    await page.locator('luci-toolbar [data-action="close"]').tap();
    await page.locator('[data-action="open-luci"]').tap();
    await page.locator('luci-toolbar [data-mode="layout"]').tap();
    await page.locator('luci-layout [data-part="pick-layer"]').waitFor();
    await page.locator('h1').tap({ force: true });
    await page.locator('luci-layout [data-part="hover-label"]').waitFor();
    expect(await page.locator('luci-layout [data-part="selection"]').count()).toBe(0);
    await page.locator('h1').tap({ force: true });
    await page.locator('luci-layout [data-part="selection"]').waitFor();
    await ctx.close();
  });
});
