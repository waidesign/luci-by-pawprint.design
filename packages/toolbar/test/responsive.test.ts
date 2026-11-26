/// <reference lib="dom" />
/**
 * Responsive capture (v0.3.4) through the dev toolbar: other widths are read in hidden frames of the
 * app, and the toolbar script, which the app loads in those frames too, does not start there.
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { serveSites } from '../../capture/test/browser.js';

let browser: Browser;
let site: Awaited<ReturnType<typeof serveSites>>;
let bundle: string;
beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/script.ts', import.meta.url));
  const built = build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  [browser, site, bundle] = await Promise.all([chromium.launch(), serveSites(), built.then(r => r.outputFiles[0]!.text)]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** Every frame of every page gets the toolbar script, as an app with the script tag does. */
async function context(): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = "http://127.0.0.1:9";\n${bundle}` });
  return ctx;
}

describe('responsive capture in the dev toolbar (v0.3.4)', { timeout: 60_000 }, () => {
  it('reads the other widths in frames of the app, where the toolbar does not start', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000);
    await page.goto(`${site.origin}/responsive/`);
    await page.locator('[data-action="annotate"]').waitFor();
    await page.click('[data-mode="capture"]');
    await page.click('button[data-tool="component"]');
    await page.click('#home-link', { force: true });
    await page.click('[data-output="one"]');
    // While the frames load, none of them gets a toolbar of its own
    const framesWithLuci: string[] = [];
    page.on('frameattached', frame => {
      void frame.waitForLoadState('load').then(async () => {
        await new Promise(r => setTimeout(r, 300));
        const found = await frame.evaluate(() => [...document.documentElement.children].some(e => e.tagName.startsWith('LUCI-'))).catch(() => false);
        if (found) framesWithLuci.push(frame.url());
      }).catch(() => undefined);
    });
    await page.click('[data-action="responsive"]');
    await page.locator('[data-part="responsive-note"]').waitFor();
    await page.selectOption('select[data-setting="style"]', 'luci');
    await page.selectOption('select[data-setting="units"]', 'px');
    const md = (await page.locator('[data-part="preview"]').inputValue()).replace(/\r\n/g, '\n');
    expect(md).toMatch(/## Responsive\n\| Part \| Property \| 375px \| 1280px \|/);
    expect(md).toMatch(/\| label \| font-size \| 16px \| 14px \|/);
    expect(framesWithLuci).toEqual([]);
    expect(await page.locator('iframe').count()).toBe(0);
    await ctx.close();
  });

  it('a page named as Luci\'s width frame does not start the toolbar', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(`${site.origin}/responsive/`);
    await page.locator('[data-action="annotate"]').waitFor();
    await page.evaluate(() => { window.name = 'luci-width'; });
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => [...document.documentElement.children].map(e => e.tagName.toLowerCase()).filter(t => t.startsWith('luci-')))).toEqual([]);
    await ctx.close();
  });
});
