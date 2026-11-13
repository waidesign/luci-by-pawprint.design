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
const preview = async (page: Page) => await page.locator('[data-part="preview"]').evaluate(el => ('value' in el ? (el as HTMLTextAreaElement).value : el.textContent) ?? '');
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
    expect(await page.locator('button[data-tool]').allInnerTexts()).toEqual(['Component', 'Text', 'Color', 'Spacing']);
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
    expect(await page.locator('[data-part="selected-name"]').innerText()).toBe('li (listitem)');
  });

  it('after a click the selection stays: ↑ ↓ and the Wider / Narrower buttons change it, Enter takes "This one" (user feedback)', async () => {
    await page.click('button[data-tool="text"]');
    await page.click('.card p >> nth=0');
    const name = () => page.locator('[data-part="selected-name"]').innerText();
    expect(await name()).toBe('p (paragraph)');
    expect(await page.locator('[data-part="selection"]').count()).toBe(1);
    expect(await page.locator('[data-part="output-hints"]').innerText()).toContain('This one: this text style');
    await page.keyboard.press('ArrowUp');
    expect(await name()).toBe('li (listitem)');
    await page.keyboard.press('ArrowDown');
    expect(await name()).toBe('p (paragraph)');
    await page.keyboard.press('Enter');
    expect(await preview(page)).toContain('type: text');

    // The same with the buttons
    await page.click('button[data-tool="text"]');
    await page.click('.card p >> nth=0');
    await page.click('[data-action="widen"]');
    expect(await name()).toBe('li (listitem)');
    await page.click('[data-action="narrow"]');
    expect(await name()).toBe('p (paragraph)');
    await page.click('[data-output="one"]');
    expect(await preview(page)).toContain('type: text');
  });

  it('the page itself redirects to the system output (FR4, FR12)', async () => {
    await page.click('button[data-tool="text"]');
    await page.hover('footer');
    await page.keyboard.press('ArrowUp');
    expect(await label(page)).toContain('This is the whole page');
    await page.keyboard.press('Enter');
    expect(await page.locator('[data-part="selected-name"]').innerText()).toBe('body');
    expect(await page.locator('[data-output="one"]').count()).toBe(0);
    await page.click('[data-output="system"]');
    const md = await preview(page);
    expect(md).toContain('type: typography');
    expect(md).toContain('| heading-1 |');
  });

  it('Color: an element, the whole system, and eyedropper pixels (FR13, FR14)', async () => {
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

  it('Component: states from stylesheet rules without the debugger; a JavaScript hover can be captured by hand (FR8)', async () => {
    await page.click('button[data-tool="component"]');
    await page.click('.button >> nth=0');
    await page.click('[data-output="one"]');
    const md = await preview(page);
    expect(md).toContain('scope: component');
    expect(md).toContain('| hover | background-color #0f62fe → #0353e9 | stylesheet rules |');
    expect(md).toContain('| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |');

    await page.click('button[data-tool="component"]');
    await page.click('#js-hover');
    await page.click('[data-output="one"]');
    expect(await preview(page)).toContain('| hover | Not detected');
    expect(await page.locator('select[data-setting="manual-state"]').inputValue()).toBe('hover');
    await page.click('[data-action="capture-state"]');
    await page.hover('#js-hover');
    await expect.poll(() => preview(page), { timeout: 6000 }).toContain('captured by hand');
    expect(await preview(page)).toContain('| hover | color #525252 → #da1e28 | captured by hand |');
    await page.mouse.move(10, 10);
  });

  it('instructions for the agent go into the file; the file can be edited; edits survive settings and reach the basket (user request)', async () => {
    // A page shortcut on "s", as many sites have: typing in Luci's boxes must not trigger it
    await page.evaluate(() => { (window as unknown as { pageKeys: number }).pageKeys = 0; document.addEventListener('keydown', () => { (window as unknown as { pageKeys: number }).pageKeys++; }); });
    await page.click('button[data-tool="color"]');
    await page.click('.button >> nth=0');
    await page.click('[data-output="one"]');
    await page.locator('[data-part="instructions"]').fill('Use this as our primary color, but slightly darker.');
    let md = await preview(page);
    expect(md).toMatch(/---\n\n## Your instructions\nUse this as our primary color, but slightly darker\.\n\n## Color/);
    await page.locator('[data-part="instructions"]').press('s');
    expect(await page.evaluate(() => (window as unknown as { pageKeys: number }).pageKeys)).toBe(0);

    // Edit the file by hand
    await page.locator('[data-part="preview"]').fill(md.replace('| accent |', '| brand accent |'));
    expect(await page.locator('[data-part="edited-note"]').count()).toBe(1);
    // Settings no longer change edited text; the instructions box still updates its own section
    await page.selectOption('select[data-setting="colors"]', 'rgb');
    expect(await preview(page)).toContain('| #0f62fe |');
    await page.locator('[data-part="instructions"]').fill('Use this as our primary color.');
    md = await preview(page);
    expect(md).toContain('## Your instructions\nUse this as our primary color.\n\n## Color');
    expect(md).toContain('| brand accent |');

    await page.click('[data-action="add-to-basket"]');
    await page.click('[data-action="basket"]');
    await page.locator('[data-item-export]').last().click();
    expect(await preview(page)).toContain('| brand accent |');
    await page.click('[data-action="basket-back"]');
    await page.click('[data-action="basket"]');

    // Undo goes back to the generated file, with the current settings
    await page.click('button[data-tool="color"]');
    await page.click('.button >> nth=0');
    await page.click('[data-output="one"]');
    await page.locator('[data-part="preview"]').fill('anything');
    await page.click('[data-action="undo-edits"]');
    expect(await preview(page)).toContain('| rgb(15, 98, 254) |');
    await page.selectOption('select[data-setting="colors"]', 'hex');
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

describe('tool hints and the Color tool\'s two ways to pick (user feedback, M4)', { timeout: 30_000 }, () => {
  it('each tool says what to do; Color offers Element and Pixel side by side, Pixel off without an eyedropper', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    // A browser without the EyeDropper API (Firefox, older Chrome)
    await page.addInitScript(() => { delete (window as unknown as { EyeDropper?: unknown }).EyeDropper; });
    await page.goto(`${server.origin}/css-variables/`);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => { (window as unknown as { LuciCapture: { mountToolbar(): unknown } }).LuciCapture.mountToolbar(); });
    expect(await page.locator('[data-action="eyedropper"]').count()).toBe(0);
    await page.click('button[data-tool="text"]');
    expect(await page.locator('[data-part="hint"]').innerText()).toContain('Hover any text');
    await page.click('button[data-tool="spacing"]');
    expect(await page.locator('[data-part="hint"]').innerText()).toContain('drag from one element to another');
    await page.click('button[data-tool="color"]');
    expect(await page.locator('[data-color-mode]').allInnerTexts()).toEqual(['Element', 'Pixel']);
    expect(await page.locator('[data-color-mode="element"]').getAttribute('aria-pressed')).toBe('true');
    // Without an eyedropper, Pixel stays visible but off, with the reason
    expect(await page.locator('[data-color-mode="pixel"]').isDisabled()).toBe(true);
    expect(await page.locator('[data-part="hint"]').innerText()).toContain('This browser cannot pick pixels.');
    // The hint goes away once something is picked
    await page.click('h1');
    expect(await page.locator('[data-part="tool-hint"]').count()).toBe(0);
    await context.close();
  });

  it('Pixel opens the eyedropper; a picked spot becomes a color file, and Esc goes back to Element', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    // A stand-in for Chrome's eyedropper: the first open picks the accent, the next one is cancelled
    await page.addInitScript(() => {
      let opens = 0;
      (window as unknown as { EyeDropper: unknown }).EyeDropper = class {
        open() { opens++; return opens === 1 ? Promise.resolve({ sRGBHex: '#0f62fe' }) : Promise.reject(new DOMException('cancelled', 'AbortError')); }
      };
    });
    await page.goto(`${server.origin}/css-variables/`);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => { (window as unknown as { LuciCapture: { mountToolbar(): unknown } }).LuciCapture.mountToolbar(); });
    await page.click('button[data-tool="color"]');
    await page.click('[data-color-mode="pixel"]');
    const md = await preview(page);
    expect(md).toContain('`--color-primary`');
    expect(md).toContain('method: measured');
    await page.click('button[data-tool="color"]');
    await page.click('[data-color-mode="pixel"]');
    expect(await page.locator('[data-color-mode="element"]').getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('[data-part="hint"]').count()).toBe(1);
    await context.close();
  });
});

describe('Pixel mode from a screenshot (user feedback)', { timeout: 30_000 }, () => {
  it('shows the color under the pointer, ignores Luci\'s own bar, and picks on click', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    // The extension's screenshot, here from Playwright
    await page.exposeFunction('luciScreenshot', async () => `data:image/png;base64,${(await page.screenshot()).toString('base64')}`);
    await page.goto(`${server.origin}/css-variables/`);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const w = window as unknown as { LuciCapture: { mountToolbar(o: object): unknown }; luciScreenshot(): Promise<string> };
      w.LuciCapture.mountToolbar({ captureScreen: () => w.luciScreenshot() });
    });
    await page.click('button[data-tool="color"]');
    await page.click('[data-color-mode="pixel"]');
    await page.locator('[data-part="pixel-layer"]').waitFor();
    expect(await page.locator('[data-color-mode="pixel"]').getAttribute('aria-pressed')).toBe('true');
    const button = (await page.locator('.button').first().boundingBox())!;
    await page.mouse.move(button.x + 6, button.y + button.height / 2);
    expect(await page.locator('[data-part="pixel-swatch"]').innerText()).toBe('#0f62fe');
    // Over Luci's bar nothing is picked; back on the page, picking carries on
    const bar = (await page.locator('[data-tool="text"]').boundingBox())!;
    await page.mouse.move(bar.x + 5, bar.y + 5);
    expect(await page.locator('[data-part="pixel-swatch"]').count()).toBe(0);
    await page.mouse.move(button.x + 6, button.y + button.height / 2);
    expect(await page.locator('[data-part="pixel-swatch"]').innerText()).toBe('#0f62fe');
    await page.mouse.click(button.x + 6, button.y + button.height / 2);
    const md = await preview(page);
    expect(md).toContain('`--color-primary`');
    expect(md).toContain('method: measured');
    // The page did not follow the link under the pointer
    expect(page.url()).toBe(`${server.origin}/css-variables/`);
    await context.close();
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
