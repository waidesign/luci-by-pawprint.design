/// <reference lib="dom" />
/**
 * Responsive capture (v0.3.4): breakpoints from media conditions, the widths chosen from them, the
 * differences between readings, and both ways of reading other widths in real Chromium: a hidden
 * frame of the page (any shell) and resizing the window (the extension's debugger; here Playwright's
 * viewport stands in for it). The fixture "responsive" has a section with two breakpoints.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { chooseThresholds, mediaThresholds, pickWidths, responsiveChanges, uniqueParts, type PartReading } from '../src/responsive.js';
import { captureBundle, launch, serveSites } from './browser.js';

describe('responsive: breakpoints and widths (pure)', () => {
  it('reads min-width, max-width and range conditions in px, em and rem', () => {
    expect(mediaThresholds('(min-width: 768px)')).toEqual([768]);
    expect(mediaThresholds('(max-width: 767px)')).toEqual([768]);
    expect(mediaThresholds('(max-width: 767.98px)')).toEqual([768]);
    expect(mediaThresholds('screen and (min-width: 48em) and (max-width: 63.99em)')).toEqual([768, 1024]);
    expect(mediaThresholds('(width >= 64rem)')).toEqual([1024]);
    expect(mediaThresholds('(width < 640px)')).toEqual([640]);
    expect(mediaThresholds('(width > 639px)')).toEqual([640]);
    expect(mediaThresholds('print')).toEqual([]);
    expect(mediaThresholds('(prefers-reduced-motion: reduce)')).toEqual([]);
  });

  it('one width per range: a phone below the first breakpoint, the breakpoint between, a desktop above; at most two breakpoints', () => {
    expect(pickWidths([{ px: 768, weight: 4 }, { px: 1024, weight: 1 }])).toEqual([375, 768, 1280]);
    expect(pickWidths([{ px: 1024, weight: 2 }])).toEqual([375, 1280]);
    expect(pickWidths([{ px: 360, weight: 1 }])).toEqual([359, 1280]);
    expect(pickWidths([{ px: 1440, weight: 1 }, { px: 640, weight: 1 }])).toEqual([375, 640, 1440]);
    // The breakpoints that style the most rules win
    expect(chooseThresholds([{ px: 640, weight: 1 }, { px: 768, weight: 5 }, { px: 1024, weight: 3 }, { px: 768, weight: 1 }])).toEqual([768, 1024]);
    expect(pickWidths([])).toEqual([]);
  });

  it('lists what differs: values by width, a part shown at some widths, grid columns by count, fluid sizes left out', () => {
    const v = (computed: string, authored?: string) => ({ computed, ...(authored ? { authored } : {}) });
    const at = (cols: string, pad: string, lead: boolean, width: string): PartReading[] => [
      { part: 'container', styles: [{ property: 'padding', value: v(pad) }, { property: 'width', value: v(width, '100%') }] },
      ...(lead ? [{ part: 'description', styles: [{ property: 'font-size', value: v('18px') }] }] : []),
      { part: 'grid', styles: [{ property: 'grid-template-columns', value: v(cols) }] }
    ];
    expect(responsiveChanges([at('343px', '48px 16px', false, '375px'), at('352px 352px', '96px 24px', true, '768px'), at('400px 400px 400px', '96px 24px', true, '1280px')])).toEqual([
      { part: 'container', property: 'padding', values: ['48px 16px', '96px 24px', '96px 24px'] },
      { part: 'grid', property: 'grid-template-columns', values: ['1 column', '2 columns', '3 columns'] },
      { part: 'description', property: 'shown', values: ['no', 'yes', 'yes'] }
    ]);
    expect(uniqueParts([{ part: 'box', styles: [] }, { part: 'box', styles: [] }]).map(p => p.part)).toEqual(['box', 'box (2)']);
  });
});

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

async function open(options: { emulate?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15_000);
  if (options.emulate) {
    // What the extension's debugger does, with Playwright's viewport
    await page.exposeFunction('luciSetWidth', async (w: number | null) => { await page.setViewportSize({ width: w ?? 1280, height: 900 }); });
  }
  await page.goto(`${server.origin}/responsive/`);
  await page.addScriptTag({ content: bundle });
  await page.evaluate((emulate) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.LuciCapture.mountToolbar(emulate ? { setViewportWidth: (width: number | null) => w.luciSetWidth(width) } : {});
  }, Boolean(options.emulate));
  return page;
}
const preview = (page: Page) => page.locator('[data-part="preview"]').inputValue().then(t => t.replace(/\r\n/g, '\n'));
const responsiveOf = (md: string) => /## Responsive\n([\s\S]*?)(?=\n## |$)/.exec(md)?.[1] ?? '';

describe('responsive capture in the toolbar (v0.3.4)', { timeout: 60_000 }, () => {
  it('a section in hidden frames of the page: its two breakpoints give three widths and what changes', async () => {
    const page = await open();
    await page.click('button[data-tool="component"]');
    await page.click('#pricing > h2', { force: true });
    await page.click('[data-action="widen"]');
    await page.click('[data-output="section"]');
    await page.locator('[data-part="preview"]').waitFor();
    expect(await preview(page)).toContain('selector: "#pricing"');
    expect(await preview(page)).not.toContain('## Responsive');
    await page.click('[data-action="responsive"]');
    await page.locator('[data-part="responsive-note"]').waitFor();
    const section = responsiveOf(await preview(page));
    expect(section).toContain('| Part | Property | 375px | 768px | 1280px |');
    expect(section).toMatch(/\| container \| padding \| 48px 16px \| 96px 24px \| 96px 24px \|/);
    expect(section).toMatch(/\| heading \| font-size \| 28px \| 40px \| 40px \|/);
    expect(section).toMatch(/\| description \| shown \| no \| yes \| yes \|/);
    expect(section).toMatch(/\| \S+ \| grid-template-columns \| 1 column \| 2 columns \| 3 columns \|/);
    expect(section).toContain('- Media queries that style it: `(min-width: 768px)`, `(min-width: 1024px)`.');
    expect(section).not.toContain('print');
    expect(await page.locator('[data-part="responsive-note"]').innerText()).toMatch(/^\d+ changes at 375px, 768px, 1280px: see Responsive in the file\.$/);
    // The frames are gone and the page is as it was
    expect(await page.locator('iframe').count()).toBe(0);
    expect(await page.evaluate(() => innerWidth)).toBe(1280);
    await page.close();
  });

  it('a component by resizing the window (as the extension does): its max-width query, and the window put back', async () => {
    const page = await open({ emulate: true });
    await page.click('button[data-tool="component"]');
    await page.click('#home-link', { force: true });
    await page.click('[data-output="one"]');
    await page.locator('[data-part="preview"]').waitFor();
    await page.click('[data-action="responsive"]');
    await page.locator('[data-part="responsive-note"]').waitFor();
    const section = responsiveOf(await preview(page));
    expect(section).toContain('| Part | Property | 375px | 1280px |');
    // The link's text is its label part
    expect(section).toMatch(/\| label \| font-size \| 16px \| 14px \|/);
    expect(section).toMatch(/\| container \| padding \| 12px 16px \| – \|/);
    expect(section).toContain('`(max-width: 1023px)`');
    expect(await page.evaluate(() => innerWidth)).toBe(1280);
    // A state captured by hand keeps Responsive in the file
    await page.click('[data-action="capture-state"]').catch(() => undefined);
    await page.click('[data-action="cancel-capture"]').catch(() => undefined);
    expect(await preview(page)).toContain('## Responsive');
    // A new pick starts without it
    await page.click('button[data-tool="component"]');
    await page.click('#home-link', { force: true });
    await page.click('[data-output="one"]');
    expect(await preview(page)).not.toContain('## Responsive');
    await page.close();
  });
});
