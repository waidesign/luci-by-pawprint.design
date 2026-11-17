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
});
