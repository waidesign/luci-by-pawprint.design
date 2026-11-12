/// <reference lib="dom" />
/**
 * The on-page toolbar in real Chromium (FR1-FR6, FR11-FR16), driven like a person would: pointer
 * moves, clicks, drags and keys.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
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

async function open(site: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.origin });
  const page = await context.newPage();
  // Fail with Playwright's message (which step, which element) before the test's own timeout
  page.setDefaultTimeout(4000);
  await page.goto(`${server.origin}/${site}/`);
  await page.addScriptTag({ content: bundle });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => { (window as any).toolbar = (window as any).LuciCapture.mountToolbar(); });
  return page;
}
const preview = async (page: Page) => (await page.locator('[data-part="preview"]').textContent()) ?? '';
const label = (page: Page) => page.locator('[data-part="hover-label"]').innerText();

describe('toolbar (M4.4)', { timeout: 30_000 }, () => {
  let page: Page;
  beforeAll(async () => { page = await open('css-variables'); }, 60_000);
  afterAll(async () => { await page.context().close(); });

  it('lives in its own shadow root, and captures never include it (FR1)', async () => {
    const info = await page.evaluate(() => {
      const host = document.querySelector('luci-toolbar')!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = (window as any).LuciCapture.snapshotPage();
      return { shadow: Boolean(host.shadowRoot), inSnapshot: snap.elements.some((e: { tag: string }) => e.tag === 'luci-toolbar') };
    });
    expect(info).toEqual({ shadow: true, inSnapshot: false });
    expect(await page.locator('button[data-tool]').allInnerTexts()).toEqual(['Text', 'Colour', 'Spacing']);
  });

  it('hover shows tag and size; an image is greyed with the reason and cannot be picked (FR2, FR4)', async () => {
    await page.click('button[data-tool="text"]');
    await page.hover('h1');
    expect(await label(page)).toMatch(/^h1 {2}\d+ × \d+/);
    await page.hover('#logo');
    expect(await label(page)).toContain('Images cannot be captured.');
    expect(await page.locator('.highlight.blocked').count()).toBe(1);
    await page.click('#logo');
    expect(await page.locator('[data-part="notice"]').innerText()).toBe('Images cannot be captured.');
    expect(await page.locator('[data-output]').count()).toBe(0);
  });

  it('Text: click a heading, "This one" gives its text style (FR5, FR11)', async () => {
    await page.click('button[data-tool="text"]');
    await page.click('h1');
    await page.click('[data-output="one"]');
    expect(await page.locator('[data-part="file-name"]').innerText()).toBe('127-0-0-1.token.text-heading-1.design.md');
    const md = await preview(page);
    expect(md).toContain('name: text-heading-1');
    expect(md).toContain('| font-size | 48px | `clamp(2rem, 2rem + 2vw, 3rem)` |  |');
    await page.selectOption('select[data-setting="units"]', 'rem');
    expect(await preview(page)).toContain('| font-size | 3rem |');
    await page.selectOption('select[data-setting="units"]', 'px');
  });

  it('arrow keys widen to the parent and narrow back; Enter picks; Esc cancels (FR2, FR3)', async () => {
    await page.click('button[data-tool="text"]');
    await page.hover('.card p >> nth=0');
    expect(await label(page)).toMatch(/^p /);
    await page.keyboard.press('ArrowUp');
    expect(await label(page)).toMatch(/^li /);
    await page.keyboard.press('ArrowDown');
    expect(await label(page)).toMatch(/^p /);
    await page.keyboard.press('Escape');
    expect(await page.locator('.highlight').count()).toBe(0);
    await page.click('button[data-tool="text"]');
    await page.hover('.card p >> nth=0');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    expect(await page.locator('.panel h2').innerText()).toBe('li (listitem)');
  });

  it('the page itself redirects to the system output (FR4, FR12)', async () => {
    await page.click('button[data-tool="text"]');
    await page.hover('footer');
    await page.keyboard.press('ArrowUp');
    expect(await label(page)).toContain('This is the whole page');
    await page.keyboard.press('Enter');
    expect(await page.locator('.panel h2').innerText()).toBe('body');
    expect(await page.locator('[data-output="one"]').count()).toBe(0);
    await page.click('[data-output="system"]');
    const md = await preview(page);
    expect(md).toContain('type: typography');
    expect(md).toContain('| heading-1 |');
  });

  it('Colour: an element, the whole system, and eyedropper pixels (FR13, FR14)', async () => {
    await page.click('button[data-tool="color"]');
    await page.click('.button >> nth=0');
    await page.click('[data-output="one"]');
    expect(await preview(page)).toContain('| #0f62fe | `var(--color-primary)` | `--color-primary` | accent |');
    await page.click('button[data-tool="color"]');
    await page.click('.button >> nth=1');
    await page.click('[data-output="system"]');
    expect(await preview(page)).toMatch(/\| `--color-unused` \| #da1e28 \| 0 \|/);
    await page.evaluate(() => (window as unknown as { toolbar: { pickPixel(h: string): void } }).toolbar.pickPixel('#0F62FE'));
    expect(await preview(page)).toContain('method: measured');
    await page.evaluate(() => (window as unknown as { toolbar: { pickPixel(h: string): void } }).toolbar.pickPixel('#c9a227'));
    const estimated = await preview(page);
    expect(estimated).toContain('method: estimated');
    expect(estimated).toContain('picked from a pixel');
  });

  it('Spacing: pick a value an element sets, or drag between two elements to measure (FR15, FR16)', async () => {
    await page.click('button[data-tool="spacing"]');
    await page.hover('.card >> nth=0');
    expect(await label(page)).toContain('padding 24px');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.click('[data-choice="column-gap"]');
    await page.click('[data-output="one"]');
    expect(await preview(page)).toContain('| 16px | gap | column-gap | authored | `var(--space-4)` | `--space-4` |');

    await page.click('button[data-tool="spacing"]');
    const h1 = (await page.locator('h1').boundingBox())!;
    const lead = (await page.locator('.lead').boundingBox())!;
    await page.mouse.move(h1.x + 40, h1.y + h1.height / 2);
    await page.mouse.down();
    await page.mouse.move(lead.x + 40, lead.y + lead.height / 2, { steps: 5 });
    await page.mouse.up();
    const md = await preview(page);
    expect(md).toContain('| 24px | distance |  | measured |');
    expect(md).toContain('- From h1 (heading): `h1`');
  });

  it('download saves a .design.md with the shown name; copy puts the text on the clipboard (FR20)', async () => {
    await page.click('button[data-tool="spacing"]');
    await page.click('header');
    await page.click('[data-output="system"]');
    const name = await page.locator('[data-part="file-name"]').innerText();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download"]')]);
    expect(download.suggestedFilename()).toBe(name);
    await page.click('[data-action="copy"]');
    // Windows' clipboard stores line breaks as CRLF
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(await preview(page));
  });
});

describe('toolbar inside web components (FR6)', () => {
  it('picks an element inside a shadow root and resolves its token', async () => {
    const page = await open('web-components');
    await page.click('button[data-tool="color"]');
    await page.locator('plan-card').first().locator('button').click();
    await page.click('[data-output="one"]');
    const md = await preview(page);
    expect(md).toContain('`--wc-primary`');
    expect(md).toContain('selector: plan-card:nth-of-type(1) >> button');
    await page.context().close();
  }, 60_000);
});
