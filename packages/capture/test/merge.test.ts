/// <reference lib="dom" />
/**
 * Multi-page system merge (v0.3.3) in the toolbar: the typography, color and spacing systems of two
 * pages of one site go into the basket, "Merge into site systems" makes one site-level file per type,
 * and its export lists both pages, which pages use each row, and the values that differ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { parseCapture } from '@luci/format/capture';
import { captureBundle, launch, serveSites } from './browser.js';

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

/** The toolbar with a basket kept in the site's localStorage, so it spans the site's pages. */
async function open(context: BrowserContext, route: string): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`${server.origin}${route}`);
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).LuciCapture.mountToolbar({
      basket: { load: async () => JSON.parse(localStorage.getItem('basket') ?? '[]'), save: async (items: unknown) => localStorage.setItem('basket', JSON.stringify(items)) }
    });
  });
  return page;
}
async function systemsToBasket(page: Page) {
  for (const tool of ['text', 'color', 'spacing']) {
    await page.click(`button[data-tool="${tool}"]`);
    await page.click('h1', { force: true });
    await page.click('[data-output="system"]');
    await page.locator('[data-part="preview"]').waitFor();
    await page.click('[data-action="add-to-basket"]');
    await page.locator('[data-action="add-to-basket"][aria-label="View in basket"]').waitFor();
  }
}

describe('merge into site systems (v0.3.3)', { timeout: 60_000 }, () => {
  it('two pages of a site become one site-level file per system, with pages and conflicts', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const site = new URL(server.origin).host;
    await systemsToBasket(await open(context, '/site/'));
    const page = await open(context, '/site/blog.html');
    await systemsToBasket(page);

    await page.click('[data-action="basket"]');
    expect(await page.locator('[data-part="merge"] .dim').innerText()).toContain(`typography from 2 pages of ${site}, color from 2 pages of ${site}, spacing from 2 pages of ${site}`);
    await page.click('[data-action="merge-systems"]');
    const names = ['Site typography', 'Site color', 'Site spacing'];
    expect(await page.locator('[data-part="merged"]').innerText()).toContain(names.map(n => `${n} (${site}, 2 pages)`).join(', '));
    expect(await page.locator('[data-item] .meta').last().innerText()).toBe(`Systems · ${site}, 2 pages`);
    expect(await page.locator('[data-item-name]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))).toHaveLength(9);
    // Merging again replaces the site systems instead of adding more
    await page.click('[data-action="merge-systems"]');
    const all = await page.locator('[data-item-name]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
    expect(all.slice(6)).toEqual(names);

    const exportOf = async (index: number) => {
      await page.locator('[data-item-export]').nth(index).click();
      const md = (await page.locator('[data-part="preview"]').innerText()).replace(/\r\n/g, '\n');
      const file = await page.locator('[data-part="file-name"]').innerText();
      await page.click('[data-action="basket-back"]');
      return { md, file };
    };
    const typo = await exportOf(6);
    expect(typo.file).toBe(`127-0-0-1.system.site-typography.design.md`);
    expect(parseCapture(typo.md).ok).toBe(true);
    expect(typo.md).toContain('\nname: site-typography\n');
    expect(typo.md).toContain(`source: ${server.origin}/\n`);
    expect(typo.md).toContain('pages: ["/site/", "/site/blog.html"]');
    // The same h1 and body text on both pages: one row each, used on all pages
    expect(typo.md).toMatch(/\| heading-1 \| Arial, sans-serif \| 40px \| 700 \| 48px \| normal \| #161616 \| 2 \| h1 \| all \|/);
    expect(typo.md).toMatch(/\| role heading-2 \| Arial, sans-serif 28px\/36px 700 #161616 on \/site\/; Arial, sans-serif 32px\/40px 600 #161616 on \/site\/blog\.html \|/);

    const color = await exportOf(7);
    expect(color.md).toMatch(/\| token --brand \| #0f62fe on \/site\/; #0043ce on \/site\/blog\.html \|/);
    expect(color.md).toMatch(/\| `--text` \| #161616 \| \d+ \| all \|/);

    const spacing = await exportOf(8);
    expect(spacing.md).toMatch(/\| 24px \|  \|  \| \d+ \| \/site\/ \|/);
    expect(spacing.md).toMatch(/\| 32px \|  \|  \| \d+ \| \/site\/blog\.html \|/);
    expect(spacing.md).toMatch(/\| 16px \|  \|  \| \d+ \| all \|/);
    expect(spacing.md).toContain('## Base unit\n- 8px:');
    await context.close();
  });
});
