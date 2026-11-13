/// <reference lib="dom" />
/**
 * Image capture (FR4 as changed 2026-11-13, FR21, FR22): the Image tool records how an image is
 * shown and never the image (no URL, no pixels); any pick can carry a reference screenshot; the
 * basket exports as one .zip with the screenshots beside the collection file.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { parseCapture, parseCollection, type ImageToken } from '@luci/format/capture';
import { aspectRatioOf, crc32, eligibility, imageToken, visiblePart, zip, type ImageReading } from '../src/index.js';
import { captureBundle, launch, serveSites } from './browser.js';

/** Node's own CRC-32 (Node 22.2+), independent of Luci's; the installed Node types predate it. */
const nodeCrc32 = (zlib as unknown as { crc32(data: Uint8Array): number }).crc32;

/** Read a .zip the way an unzip tool does: from the central directory, checking each file's CRC. */
function unzip(bytes: Uint8Array): Record<string, Buffer> {
  const buf = Buffer.from(bytes);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    expect(nodeCrc32(data), name).toBe(crc);
    files[name] = data;
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

describe('image analysis (pure)', () => {
  it('names common shapes, and writes others as a ratio to 1', () => {
    expect(aspectRatioOf(1280, 720)).toBe('16:9');
    expect(aspectRatioOf(720, 1280)).toBe('9:16');
    expect(aspectRatioOf(64, 64)).toBe('1:1');
    expect(aspectRatioOf(400, 500)).toBe('4:5');
    expect(aspectRatioOf(1201, 800)).toBe('3:2');
    expect(aspectRatioOf(960, 400)).toBe('2.4:1');
    expect(aspectRatioOf(100, 0)).toBe('unknown');
  });

  it('the Image tool takes images and nothing else; the other tools point to it', () => {
    for (const tag of ['img', 'picture', 'video', 'canvas', 'svg']) expect(eligibility({ tag }, { imageTool: true }).status, tag).toBe('allowed');
    expect(eligibility({ tag: 'div', backgroundImage: 'url("a.jpg")' }, { imageTool: true }).status).toBe('allowed');
    expect(eligibility({ tag: 'button' }, { imageTool: true })).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Not an image') });
    expect(eligibility({ tag: 'iframe' }, { imageTool: true }).status).toBe('blocked');
    expect(eligibility({ tag: 'img' })).toMatchObject({ status: 'blocked', reason: expect.stringContaining('Use the Image tool') });
  });

  it('keeps no URL anywhere, even from authored values and overlays (FR21)', () => {
    const reading: ImageReading = {
      url: 'https://example.com/a?b=1', kind: 'background', element: 'section (region)', selector: 'section', width: 1600, height: 900,
      styles: { 'background-image': 'linear-gradient(red, blue), url("https://cdn.example.com/hero.jpg")', 'background-size': 'cover', 'background-position': '50% 50%', 'background-repeat': 'no-repeat', 'border-radius': '0px' },
      authored: { 'background-image': 'var(--hero), url(hero.jpg)' },
      overlays: [{ on: '::after', background: "url('https://cdn.example.com/noise.png'), rgba(0, 0, 0, 0.4)" }]
    };
    const token = imageToken(reading, { captured: '2026-11-13' });
    expect(JSON.stringify(token)).not.toMatch(/url\(|cdn\.example|hero\.jpg/);
    expect(token.treatment.find(t => t.property === 'background-image')!.value.computed).toBe('linear-gradient(red, blue), <image>');
    expect(token.meta.name).toBe('image-background-16-9');
  });

  it('visiblePart crops a box to the window', () => {
    expect(visiblePart({ left: -10, top: 100, width: 50, height: 2000 }, { width: 1280, height: 900 })).toEqual({ left: 0, top: 100, width: 40, height: 800 });
    expect(visiblePart({ left: 0, top: 1000, width: 50, height: 50 }, { width: 1280, height: 900 })).toBeNull();
  });
});

describe('zip (basket export)', () => {
  it('writes stored files with UTF-8 names that read back with the right CRC', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const files = unzip(zip([{ name: 'a.collection.design.md', data: '# Grüße\n' }, { name: 'references/01-hero.png', data: png }]));
    expect(Object.keys(files)).toEqual(['a.collection.design.md', 'references/01-hero.png']);
    expect(files['a.collection.design.md']!.toString('utf8')).toBe('# Grüße\n');
    expect([...files['references/01-hero.png']!]).toEqual([...png]);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('refuses names that could leave the folder, and repeated names', () => {
    for (const name of ['../x', '/x', 'a\\b', 'a/../../b', '']) expect(() => zip([{ name, data: 'x' }]), name).toThrow();
    expect(() => zip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }])).toThrow(/two files/);
  });
});

describe('the Image tool on a real page', { timeout: 60_000 }, () => {
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

  async function open(viewport = { width: 1280, height: 900 }): Promise<Page> {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    // The extension's screenshot of the visible tab, here from Playwright
    await page.exposeFunction('luciScreenshot', async () => `data:image/png;base64,${(await page.screenshot()).toString('base64')}`);
    await page.goto(`${server.origin}/images/`);
    await page.addScriptTag({ content: bundle });
    return page;
  }

  it('reads how each kind of image is shown, with no URL in any file', async () => {
    const page = await open();
    const results = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      return Object.fromEntries(['#photo', '#hero', '#avatar', '#clip', '#chart', '#pic', '#buy'].map(sel => {
        const r = L.captureImage(live, live.entryFor(document.querySelector(sel)), { units: 'px' });
        return [sel, r.ok ? { capture: r.output.capture, markdown: r.output.markdown, fileName: r.output.fileName } : { message: r.message }];
      }));
    }) as Record<string, { capture: ImageToken; markdown: string; fileName: string; message?: string }>;

    for (const [sel, r] of Object.entries(results)) {
      if (sel === '#buy') continue;
      expect(parseCapture(r.markdown).ok, sel).toBe(true);
      expect(r.markdown, sel).not.toMatch(/url\(|data:image|base64/);
    }
    const prop = (r: { capture: ImageToken }, p: string) => r.capture.treatment.find(t => t.property === p);

    const photo = results['#photo']!;
    expect(photo.fileName).toBe('127-0-0-1.token.image-img-16-9.design.md');
    expect(photo.capture).toMatchObject({ kind: 'img', aspectRatio: '16:9', sourceAspectRatio: '3:2', size: { width: 640, height: 360 } });
    expect(prop(photo, 'object-fit')!.value.computed).toBe('cover');
    expect(prop(photo, 'object-position')!.value.computed).toBe('50% 30%');
    expect(prop(photo, 'filter')!.value.computed).toBe('saturate(1.2)');
    // The wrapper clips the corners, through a token
    expect(prop(photo, 'border-radius')).toMatchObject({ on: 'figure', value: { computed: '12px', token: '--radius-lg' } });
    expect(photo.capture.overlays).toEqual([{ on: 'div over it', background: 'linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0))' }]);
    expect(photo.markdown).toContain('| border-radius | 12px | `var(--radius-lg)` | `--radius-lg` | figure around it |');
    expect(photo.markdown).toContain('- Use your own image here, shown at 16:9, object-fit cover, object-position 50% 30%, 12px corners (clipped by the figure around it), with the filter and overlay listed above.');

    const hero = results['#hero']!;
    expect(hero.capture).toMatchObject({ kind: 'background', aspectRatio: '2.4:1' });
    expect(prop(hero, 'background-size')!.value.computed).toBe('cover');
    expect(prop(hero, 'background-repeat')!.value.computed).toBe('no-repeat');
    expect(prop(hero, 'background-image')!.value.computed).toBe('linear-gradient(rgba(15, 98, 254, 0.4), rgba(15, 98, 254, 0.4)), <image>');
    expect(hero.capture.overlays).toEqual([{ on: '::after', background: 'radial-gradient(circle, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.5))', opacity: '0.5', blend: 'multiply' }]);

    const avatar = results['#avatar']!;
    expect(avatar.capture.aspectRatio).toBe('1:1');
    expect(prop(avatar, 'border-radius')!.value.computed).toBe('50%');
    expect(prop(avatar, 'box-shadow')!.value.token).toBe('--shadow-card');

    expect(results['#clip']!.capture).toMatchObject({ kind: 'video', aspectRatio: '16:9' });
    expect(results['#clip']!.capture.sourceAspectRatio).toBeUndefined();
    // The canvas draws at 400 x 300 and shows at 200 x 150: the same shape, so no source ratio
    expect(results['#chart']!.capture).toMatchObject({ kind: 'canvas', aspectRatio: '4:3' });
    expect(results['#chart']!.capture.sourceAspectRatio).toBeUndefined();
    // A picture element is measured through its img
    expect(results['#pic']!.capture).toMatchObject({ kind: 'img', aspectRatio: '1:1', usedBy: { element: 'img' } });
    expect(results['#pic']!.capture.meta.selector).toMatch(/img$/);
    expect(results['#buy']!.message).toContain('Not an image');
    await page.context().close();
  });

  it('toolbar: picks the image under a tint, adds a reference screenshot, and exports the basket as a .zip', async () => {
    const page = await open();
    await page.evaluate(() => {
      const w = window as unknown as { LuciCapture: { mountToolbar(o: object): unknown }; luciScreenshot(): Promise<string> };
      w.LuciCapture.mountToolbar({ captureScreen: () => w.luciScreenshot() });
    });
    const label = () => page.locator('[data-part="hover-label"]').innerText();
    const preview = () => page.locator('[data-part="preview"]').inputValue();

    // Other tools still don't take images, and say which tool does
    await page.click('button[data-tool="component"]');
    await page.hover('#avatar', { force: true });
    expect(await label()).toContain('Use the Image tool');
    await page.keyboard.press('Escape');

    await page.click('button[data-tool="image"]');
    expect(await page.locator('[data-part="hint"]').innerText()).toContain('never the image itself');
    // The tint lies over the photo; the Image tool looks through it
    await page.hover('#photo', { force: true });
    expect(await label()).toMatch(/^img {2}640 × 360/);
    await page.hover('#buy', { force: true });
    expect(await label()).toContain('Not an image');
    await page.click('#photo', { force: true });
    expect(await page.locator('[data-part="selected-name"]').innerText()).toBe('img');
    expect(await page.locator('[data-output="system"]').count()).toBe(0);
    await page.click('[data-output="one"]');
    expect(await page.locator('[data-part="file-name"]').innerText()).toBe('127-0-0-1.token.image-img-16-9.design.md');
    expect(await preview()).not.toContain('reference:');

    await page.click('[data-action="take-reference"]');
    await page.locator('[data-part="reference-thumb"]').waitFor();
    expect(await preview()).toContain('\nreference: 127-0-0-1.token.image-img-16-9.png\n');
    expect(await page.locator('[data-part="reference"]').innerText()).toContain('640 × 360px');
    const [png] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-reference"]')]);
    expect(png.suggestedFilename()).toBe('127-0-0-1.token.image-img-16-9.png');
    const bytes = fs.readFileSync((await png.path())!);
    expect([...bytes.subarray(1, 4)].map(b => String.fromCharCode(b)).join('')).toBe('PNG');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([640, 360]);
    await page.click('[data-action="add-to-basket"]');

    // A text pick without a screenshot, to show the zip only carries what was taken
    await page.click('button[data-tool="text"]');
    await page.click('#buy', { force: true });
    await page.click('[data-output="one"]');
    await page.click('[data-action="add-to-basket"]');

    await page.click('[data-action="basket"]');
    expect(await page.locator('[data-item] .meta').first().innerText()).toContain('· screenshot');
    await page.click('[data-action="export-all"]');
    // The one-file export has no screenshot paths (they would point nowhere)
    expect(await page.locator('[data-part="preview"]').innerText()).not.toContain('references/');
    expect(await page.locator('[data-action="download-zip"]').innerText()).toBe('Download .zip (with 1 screenshot)');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-zip"]')]);
    expect(download.suggestedFilename()).toMatch(/^basket-\d{4}-\d{2}-\d{2}\.zip$/);
    const files = unzip(fs.readFileSync((await download.path())!));
    const names = Object.keys(files);
    expect(names).toEqual([expect.stringMatching(/^basket-\d{4}-\d{2}-\d{2}\.collection\.design\.md$/), 'references/01-image-img-16-9.jpg']);
    const md = files[names[0]!]!.toString('utf8');
    const parsed = parseCollection(md);
    expect(parsed.ok && parsed.value.groups).toEqual({ Text: [expect.stringMatching(/^Text /)], Images: ['Image img 16 9'] });
    expect(md).toContain('- reference screenshot: `references/01-image-img-16-9.jpg`');
    expect(md).not.toMatch(/data:image|url\(/);
    // A JPEG, at most 640px a side
    const jpg = files['references/01-image-img-16-9.jpg']!;
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);

    // One item on its own offers its screenshot beside it
    await page.click('[data-action="basket-back"]');
    await page.locator('[data-item-export]').first().click();
    expect(await page.locator('[data-part="preview"]').innerText()).toContain('reference: 127-0-0-1.token.image-img-16-9.jpg');
    const [one] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-reference"]')]);
    expect(one.suggestedFilename()).toBe('127-0-0-1.token.image-img-16-9.jpg');
    await page.context().close();
  });

  it('a reference screenshot of an element out of view scrolls to it, then back', async () => {
    const page = await open({ width: 1280, height: 600 });
    await page.evaluate(() => {
      const w = window as unknown as { LuciCapture: { mountToolbar(o: object): unknown }; luciScreenshot(): Promise<string> };
      w.LuciCapture.mountToolbar({ captureScreen: () => w.luciScreenshot() });
    });
    await page.click('button[data-tool="component"]');
    await page.click('#buy', { force: true });
    await page.click('[data-output="one"]');
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await page.evaluate(() => document.getElementById('buy')!.getBoundingClientRect().top);
    expect(box).toBeGreaterThan(600);
    await page.click('[data-action="take-reference"]');
    await page.locator('[data-part="reference-thumb"]').waitFor();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const size = await page.evaluate(() => { const r = document.getElementById('buy')!.getBoundingClientRect(); return `${Math.round(r.width)} × ${Math.round(r.height)}px`; });
    expect(await page.locator('[data-part="reference"]').innerText()).toContain(size);
    await page.context().close();
  });
});
