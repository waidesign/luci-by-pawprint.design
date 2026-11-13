/// <reference lib="dom" />
/**
 * Images inside components (user request, 2026-11-13): a component file describes how each image
 * in it is shown (its Images section), never the image itself (FR21: no URL, no pixels). A bare
 * image points to the component around it; an element with a background photo is picked like any
 * other.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { parseCapture, type ComponentCapture, type PageCapture } from '@luci/format/capture';
import { aspectRatioOf, cornersLabel, imageSlot, type ImageReading } from '../src/index.js';
import { captureBundle, launch, serveSites } from './browser.js';

describe('image slots (pure)', () => {
  it('names common shapes, and writes others as a ratio to 1', () => {
    expect(aspectRatioOf(1280, 720)).toBe('16:9');
    expect(aspectRatioOf(720, 1280)).toBe('9:16');
    expect(aspectRatioOf(64, 64)).toBe('1:1');
    expect(aspectRatioOf(400, 500)).toBe('4:5');
    expect(aspectRatioOf(1201, 800)).toBe('3:2');
    expect(aspectRatioOf(960, 400)).toBe('2.4:1');
    expect(aspectRatioOf(100, 0)).toBe('unknown');
  });

  it('says which corners a wrapper clips, or nothing when it clips all four', () => {
    expect(cornersLabel({ tl: true, tr: true, br: true, bl: true })).toBeUndefined();
    expect(cornersLabel({ tl: true, tr: true, br: false, bl: false })).toBe('top');
    expect(cornersLabel({ tl: false, tr: true, br: true, bl: false })).toBe('right');
    expect(cornersLabel({ tl: true, tr: false, br: false, bl: false })).toBe('top-left');
  });

  it('keeps no URL anywhere, even from authored values and overlays (FR21)', () => {
    const reading: ImageReading = {
      kind: 'background', width: 1600, height: 900,
      styles: { 'background-image': 'linear-gradient(red, blue), url("https://cdn.example.com/hero.jpg")', 'background-size': 'cover, cover', 'background-position': '50% 50%', 'background-repeat': 'no-repeat', 'border-radius': '0px' },
      authored: { 'background-image': 'var(--hero), url(hero.jpg)' },
      overlays: [{ on: '::after', background: "url('https://cdn.example.com/noise.png'), rgba(0, 0, 0, 0.4)" }]
    };
    const slot = imageSlot(reading, 'container');
    expect(JSON.stringify(slot)).not.toMatch(/url\(|cdn\.example|hero\.jpg/);
    expect(slot.treatment.find(t => t.property === 'background-image')!.value.computed).toBe('linear-gradient(red, blue), <image>');
    expect(slot.treatment.find(t => t.property === 'background-size')!.value.computed).toBe('cover');
    expect(slot).toMatchObject({ part: 'container', aspectRatio: '16:9' });
  });
});

describe('images in component files on a real page', { timeout: 60_000 }, () => {
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
    await page.goto(`${server.origin}/images/`);
    await page.addScriptTag({ content: bundle });
    return page;
  }

  /** A component capture of each selector, with states from the stylesheet rules. */
  async function components(page: Page, selectors: string[]) {
    return await page.evaluate(async (sels) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out: Record<string, { capture: ComponentCapture; markdown: string }> = {};
      for (const sel of sels) {
        const entry = live.entryFor(document.querySelector(sel));
        const { states } = await L.readComponentStates(live, entry);
        const r = L.captureComponent(live, entry, { units: 'px' }, { states });
        out[sel] = { capture: r.output.capture, markdown: r.output.markdown };
      }
      return out;
    }, selectors);
  }

  it('a card: its photo is a slot named like its part, with the corners the card clips, and its hover zoom', async () => {
    const page = await open();
    const { '#card': card } = await components(page, ['#card']);
    const c = card!.capture;
    expect(c.images).toHaveLength(1);
    const slot = c.images![0]!;
    expect(slot).toMatchObject({ part: 'image', kind: 'img', aspectRatio: '16:9', sourceAspectRatio: '3:2', size: { width: 360, height: 202.5 } });
    expect(c.anatomy.some(a => a.part === 'image')).toBe(true);
    const prop = (p: string) => slot.treatment.find(t => t.property === p);
    expect(prop('object-fit')!.value.computed).toBe('cover');
    expect(prop('object-position')!.value.computed).toBe('50% 30%');
    expect(prop('filter')!.value.computed).toBe('saturate(1.2)');
    // The card clips only the top corners of the photo, through a token
    expect(prop('border-radius')).toMatchObject({ on: 'container', corners: 'top', value: { computed: '12px', token: '--radius-lg' } });
    expect(c.tokens.find(t => t.token === '--radius-lg')).toBeTruthy();
    // States and Motion name the same part
    const hover = c.states.find(s => s.state === 'hover')!;
    expect(hover.changes.some(ch => ch.part === 'image' && ch.property === 'transform')).toBe(true);
    expect(c.motion.some(m => m.part === 'image' && m.target === 'transform')).toBe(true);

    const md = card!.markdown;
    expect(parseCapture(md).ok).toBe(true);
    expect(md).toContain('## Images\n| Part | Kind | Size | Shape | Fit | Corners | Effects | Layers over it |');
    expect(md).toContain('| image | img | 360 × 202.5px | 16:9 (file is 3:2), set by aspect-ratio 16 / 9 | cover, position 50% 30% | 12px (`--radius-lg`), top corners, clipped by the container | filter saturate(1.2) | none |');
    expect(md).toContain('- These are slots for your own images, framed as above. No image file or URL is included.');
    expect(md.indexOf('## Images')).toBeLessThan(md.indexOf('## States'));
    expect(md).not.toMatch(/url\(|data:image|base64/);
    await page.close();
  });

  it('a hero with a background photo is a component; a figure, an SVG image, video and canvas are slots too', async () => {
    const page = await open();
    const got = await components(page, ['#hero', '#figure', '#art', '#row']);
    for (const [sel, r] of Object.entries(got)) {
      expect(parseCapture(r.markdown).ok, sel).toBe(true);
      expect(r.markdown, sel).not.toMatch(/url\(|data:image|base64/);
    }

    const hero = got['#hero']!.capture;
    expect(hero.images).toEqual([expect.objectContaining({ part: 'container', kind: 'background', aspectRatio: '2.4:1' })]);
    const heroSlot = hero.images![0]!;
    expect(heroSlot.treatment.find(t => t.property === 'background-image')!.value.computed).toBe('linear-gradient(rgba(15, 98, 254, 0.4), rgba(15, 98, 254, 0.4)), <image>');
    expect(heroSlot.overlays).toEqual([{ on: '::after', background: 'radial-gradient(circle, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.5))', opacity: '0.5', blend: 'multiply' }]);
    expect(got['#hero']!.markdown).toContain('| container | background image | 960 × 400px | 2.4:1 | cover, position 50% 50%, no-repeat | none | none | its own background: linear-gradient(#0f62fe66, #0f62fe66), <image>; ::after: radial-gradient(circle, transparent, #00000080), opacity 0.5, blend multiply |');

    const figure = got['#figure']!.capture.images![0]!;
    // The wrapper has the photo's size: it clips all four corners, and the tint lies over it
    expect(figure.treatment.find(t => t.property === 'border-radius')).toMatchObject({ on: 'container', value: { token: '--radius-lg' } });
    expect(figure.treatment.find(t => t.property === 'border-radius')!.corners).toBeUndefined();
    expect(figure.overlays).toEqual([{ on: 'div over it', background: 'linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0))' }]);

    // The Evernote case: a picture placed inside an SVG drawing
    const art = got['#art']!.capture;
    expect(art.images).toEqual([expect.objectContaining({ part: 'image', kind: 'svg-image', aspectRatio: '3:2' })]);
    expect(art.images![0]!.treatment[0]).toEqual({ property: 'preserveAspectRatio', value: { computed: 'xMidYMid slice' } });
    expect(art.anatomy.some(a => a.part === 'image')).toBe(true);
    expect(got['#art']!.markdown).toContain('| image | SVG image | 240 × 160px | 3:2 | preserveAspectRatio xMidYMid slice |');

    const row = got['#row']!.capture.images!;
    expect(row.map(i => [i.part, i.kind, i.aspectRatio])).toEqual([['image', 'video', '16:9'], ['image-2', 'canvas', '4:3']]);
    // The canvas draws at 400 x 300 and shows at 200 x 150: the same shape, so no file shape
    expect(row[1]!.sourceAspectRatio).toBeUndefined();
    expect(row[0]!.treatment.find(t => t.property === 'border-radius')!.value.computed).toBe('8px');

    // A component with no image has no Images section
    const { '#buy': buy } = await components(page, ['#buy']);
    expect(buy!.capture.images).toBeUndefined();
    expect(buy!.markdown).not.toContain('## Images');
    await page.close();
  });

  it('Whole page gives each component that has images its Images section', async () => {
    const page = await open();
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const out = L.capturePage(L.liveSnapshot(), { units: 'px' });
      return { capture: out.output.capture, markdown: out.output.markdown };
    }) as { capture: PageCapture; markdown: string };
    expect(parseCapture(r.markdown).ok).toBe(true);
    const withImages = r.capture.components.filter(c => c.images?.length);
    expect(withImages.map(c => c.meta.selector)).toEqual(['#card']);
    // Bare images are slots, never components of their own
    expect(r.capture.components.map(c => c.meta.selector)).not.toEqual(expect.arrayContaining(['#avatar']));
    expect(r.capture.components.some(c => ['img', 'video', 'canvas'].some(t => c.anatomy[0]!.element.startsWith(t)))).toBe(false);
    expect(r.markdown).toContain('#### Images');
    expect(r.markdown).not.toMatch(/url\(|data:image|base64/);
    expect(r.capture.skipped ?? []).toEqual([]);
    await page.close();
  });

  it('toolbar: a bare image points to the component around it; ↑ Wider takes the card; a background photo can be picked', async () => {
    const page = await open();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => { (window as any).LuciCapture.mountToolbar(); });
    const label = () => page.locator('[data-part="hover-label"]').innerText();
    await page.click('button[data-tool="component"]');
    await page.hover('#photo', { force: true });
    expect(await label()).toContain('Pick the component around it (↑ Wider)');
    await page.keyboard.press('ArrowUp');
    expect(await label()).toMatch(/^article/);
    await page.keyboard.press('Enter');
    expect(await page.locator('[data-part="selected-name"]').innerText()).toMatch(/^article/);
    await page.click('[data-output="one"]');
    const md = await page.locator('[data-part="preview"]').inputValue();
    expect(md).toContain('## Images');

    await page.click('button[data-tool="component"]');
    await page.hover('#hero', { position: { x: 600, y: 300 }, force: true });
    expect(await label()).toMatch(/^div {2}960 × 400/);
    await page.click('#hero', { position: { x: 600, y: 300 }, force: true });
    await page.click('[data-output="one"]');
    expect(await page.locator('[data-part="preview"]').inputValue()).toContain('| container | background image |');
    await page.close();
  });
});
