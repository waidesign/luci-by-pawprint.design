/// <reference lib="dom" />
/**
 * Section scope (v0.2). Done when: a picked pricing section yields one section file plus its
 * component files. The section file places each component by reference; each component file is
 * described once, with its variants inside the section.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { parseCapture, type ComponentCapture, type SectionCapture } from '@luci-dev/format/capture';
import { captureBundle, launch, serveSites } from './browser.js';

describe('section scope (v0.2)', () => {
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(`${server.origin}/pricing/`);
    await page.addScriptTag({ content: bundle });
    return page;
  }

  it('a picked pricing section yields one section file plus its component files (Done when)', async () => {
    const page = await open();
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureSection(live, live.entryFor(document.querySelector('#pricing')), { units: 'px', colors: 'hex' }, { captured: '2026-11-13' });
      return { ok: out.ok, output: out.output, message: out.message };
    });
    expect(r.ok, r.message).toBe(true);
    const section = r.output.capture as SectionCapture;
    const files = r.output.files as { fileName: string; markdown: string; capture: ComponentCapture }[];

    // One section file
    expect(r.output.fileName).toBe('127-0-0-1.section.pricing.design.md');
    expect(parseCapture(r.output.markdown).ok).toBe(true);
    // One component file per kind: the plan card, and the button in it (for its own states)
    expect(files.map(f => f.fileName)).toEqual(['127-0-0-1.component.card.design.md', '127-0-0-1.component.primary-button.design.md']);
    for (const f of files) expect(parseCapture(f.markdown).ok, f.fileName).toBe(true);
    const [card, button] = files.map(f => f.capture) as [ComponentCapture, ComponentCapture];
    // Variants are counted inside the section: two plain cards and the featured one; three alike buttons
    expect(card.variants!.map(v => [v.name, v.count])).toEqual([['card', 2], ['card-2', 1]]);
    expect(button.variants!.map(v => [v.name, v.count])).toEqual([['primary-button', 3]]);
    // The card's own hover; the button's hover and focus ring in its own file
    expect(files[0]!.markdown).toMatch(/\| hover \|[^\n]*box-shadow/);
    expect(files[1]!.markdown).toMatch(/\| hover \| background-color #0f62fe → #0353e9/);
    expect(files[1]!.markdown).toContain('| Focus visible | container | outline change on focus-visible | Yes |');

    // The section file places the cards by reference, in order, and describes its own layout
    expect(section.components).toEqual([
      { name: 'card', type: 'card', file: '127-0-0-1.component.card.design.md', count: 3, variants: 2 },
      { name: 'primary-button', type: 'button', file: '127-0-0-1.component.primary-button.design.md', count: 3, variants: 1, inside: 'card' }
    ]);
    const md = r.output.markdown;
    expect(md).toContain('- container — section (region): display grid, row-gap 48px (`--space-12`)');
    expect(md).toMatch(/\n  - group — div: max-width 640px\n    - heading — h2 \(heading\): [^\n]*font-size 40px/);
    expect(md).toMatch(/\n  - grid — div: display grid, [^\n]*grid-template-columns [\d.]+px [\d.]+px [\d.]+px \(`repeat\(3, minmax\(0px, 1fr\)\)`\), max-width 1080px\n/);
    expect(md).toContain('\n    - card ×3 — div → component `card` (`127-0-0-1.component.card.design.md`), variants in order: `card`, `card-2`, `card`\n');
    expect(md).toMatch(/\n  - description — p \(paragraph\): [^\n]*font-size 14px/);
    expect(md).toContain('| `primary-button` | button | 3, inside `card` | 1 | `127-0-0-1.component.primary-button.design.md` |');
    // Structure only: no page text in any file
    for (const text of ['Simple pricing', 'Start free', 'Most popular', 'Talk to sales', '$12']) {
      expect(md, text).not.toContain(text);
      for (const f of files) expect(f.markdown, `${text} in ${f.fileName}`).not.toContain(text);
    }
    // Its text parts' contrast
    expect(section.accessibility!.contrast.map(c => c.part)).toEqual(['heading', 'description', 'description']);
    expect(md).toContain('| Text contrast | heading | 16.45:1, #161616 on #f4f4f4, large text | AAA |');
    await page.close();
  });

  it('the toolbar: "This section" shows the files, downloads one .zip, and adds them all to the basket', async () => {
    const page = await open();
    await page.evaluate(() => { (window as unknown as { LuciCapture: { mountToolbar(): void } }).LuciCapture.mountToolbar(); });
    await page.click('button[data-tool="component"]');
    await page.click('#pricing .intro h2', { force: true });
    // Wider, twice: the intro, then the section
    await page.click('[data-action="widen"]');
    await page.click('[data-action="widen"]');
    expect(await page.locator('[data-part="selected-name"]').innerText()).toBe('section (region)');
    await page.click('[data-output="section"]');
    await page.locator('[data-part="section-files"]').waitFor();
    expect(await page.locator('[data-part="file-name"]').innerText()).toBe('127-0-0-1.section.pricing.design.md');
    expect(await page.locator('[data-part="section-files"] [data-file]').allInnerTexts()).toEqual([
      expect.stringContaining('127-0-0-1.component.card.design.md'), expect.stringContaining('127-0-0-1.component.primary-button.design.md')
    ]);
    // View a component file, then back to the section file
    await page.locator('[data-part="section-files"] [data-file-view]').first().click();
    expect(await page.locator('[data-part="file-view"]').innerText()).toContain('scope: component');
    await page.click('[data-action="file-view-close"]');
    // One .zip with every file
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-zip"]')]);
    expect(download.suggestedFilename()).toBe('127-0-0-1.section.pricing.zip');
    const bytes = new Uint8Array(await (await import('node:fs')).promises.readFile((await download.path())!));
    const { unzipStored } = await import('../src/ui/zip.js');
    const archive = unzipStored(bytes);
    expect(Object.keys(archive).sort()).toEqual(['127-0-0-1.component.card.design.md', '127-0-0-1.component.primary-button.design.md', '127-0-0-1.section.pricing.design.md']);
    expect(archive['127-0-0-1.section.pricing.design.md']).toContain('scope: section');
    // The basket gets the section and its component files; its export has a Sections group
    await page.click('[data-action="add-to-basket"]');
    expect(await page.locator('[data-action="basket"]').innerText()).toBe('Basket 3');
    await page.click('[data-action="basket"]');
    await page.click('[data-action="export-all"]');
    const exported = await page.locator('[data-part="preview"]').innerText();
    expect(exported).toMatch(/^# Sections\n\n## Pricing\n/m);
    expect(exported).toMatch(/^# Components\n\n## Card\n/m);
    await page.close();
  });
});
