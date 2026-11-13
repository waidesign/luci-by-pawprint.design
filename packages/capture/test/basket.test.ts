/// <reference lib="dom" />
/**
 * The basket (FR18-FR20) and M5's Done-when line: items from two sites export as one file.
 * Two origins (127.0.0.1 and localhost) in separate pages share one basket store, as tabs share the
 * extension's storage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { parseCapture, parseCollection, type BasketItem } from '@luci/format/capture';
import { addToBasket, exportBasket, exportItem, removeFromBasket, renameInBasket } from '../src/index.js';
import { captureBundle, launch, serveSites } from './browser.js';

const textCapture = (name: string, source: string) => ({
  meta: { name, scope: 'token' as const, type: 'text' as const, source, selector: 'h1', captured: '2026-11-13', method: 'measured' as const },
  style: { family: { computed: 'Inter' }, size: { computed: '32px' }, weight: { computed: '700' }, lineHeight: { computed: '40px' }, letterSpacing: { computed: 'normal' }, color: { computed: 'rgb(0, 0, 0)' } },
  usedBy: { element: 'h1 (heading)', selector: 'h1' }
});

describe('basket logic', () => {
  it('adds, renames, removes and exports; a single export takes the basket name', () => {
    let items = addToBasket([], textCapture('text-heading-1', 'https://a.example/'));
    items = addToBasket(items, textCapture('text-body', 'https://b.example/x'));
    expect(items.map(i => i.name)).toEqual(['Text heading 1', 'Text body']);
    items = renameInBasket(items, items[0]!.id, '  Hero title ');
    expect(items[0]!.name).toBe('Hero title');
    expect(renameInBasket(items, items[0]!.id, '   ')[0]!.name).toBe('Hero title');
    const one = exportItem(items[0]!, {});
    expect(one.fileName).toBe('a-example.token.hero-title.design.md');
    expect(parseCapture(one.markdown).ok).toBe(true);
    const all = exportBasket(items, {}, 'My research');
    expect(all.fileName).toBe('my-research.collection.design.md');
    const parsed = parseCollection(all.markdown);
    expect(parsed.ok && parsed.value.sources).toEqual(['https://a.example/', 'https://b.example/x']);
    expect(removeFromBasket(items, items[0]!.id).map(i => i.name)).toEqual(['Text body']);
  });
});

describe('items from two sites export as one file (M5 Done when)', () => {
  let browser: Browser;
  let siteA: Awaited<ReturnType<typeof serveSites>>;
  let siteB: Awaited<ReturnType<typeof serveSites>>;
  let bundle: string;
  // The shared store, like the extension's storage
  let stored: BasketItem[] = [];
  beforeAll(async () => {
    [browser, siteA, siteB, bundle] = await Promise.all([launch(), serveSites('127.0.0.1'), serveSites('localhost'), captureBundle()]);
  });
  afterAll(async () => {
    await browser?.close();
    await siteA?.close();
    await siteB?.close();
  });

  async function open(url: string): Promise<Page> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.exposeFunction('luciBasketLoad', () => stored);
    await page.exposeFunction('luciBasketSave', (items: BasketItem[]) => { stored = items; });
    await page.goto(url);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => {
      const w = window as unknown as { LuciCapture: { mountToolbar(o: object): unknown }; luciBasketLoad(): Promise<unknown>; luciBasketSave(i: unknown): Promise<void> };
      w.LuciCapture.mountToolbar({ basket: { load: () => w.luciBasketLoad(), save: (items: unknown) => w.luciBasketSave(items) } });
    });
    return page;
  }
  const add = async (page: Page, tool: string, target: () => Promise<void>) => {
    await page.click(`button[data-tool="${tool}"]`);
    await target();
    await page.click('[data-output="one"]');
    await page.click('[data-action="add-to-basket"]');
    expect(await page.locator('[data-action="add-to-basket"]').innerText()).toBe('Added to basket');
  };

  it('collects on two origins, keeps items across pages, renames, and exports one collection file', async () => {
    const a = await open(`${siteA.origin}/css-variables/`);
    await add(a, 'component', () => a.click('.button >> nth=0'));
    await add(a, 'text', () => a.click('h1'));
    expect(await a.locator('[data-action="basket"]').innerText()).toBe('Basket (2)');
    await a.context().close();

    const b = await open(`${siteB.origin}/web-components/`);
    // The basket came along to the other site
    expect(await b.locator('[data-action="basket"]').innerText()).toBe('Basket (2)');
    await add(b, 'color', () => b.locator('plan-card').first().locator('button').click());
    await b.click('[data-action="basket"]');
    expect(await b.locator('[data-item]').count()).toBe(3);
    await b.locator('[data-item-name]').first().fill('Signup button');
    await b.click('[data-action="export-all"]');
    const md = (await b.locator('[data-part="preview"]').textContent()) ?? '';
    const fileName = await b.locator('[data-part="file-name"]').innerText();
    expect(fileName).toMatch(/^basket-\d{4}-\d{2}-\d{2}\.collection\.design\.md$/);
    const [download] = await Promise.all([b.waitForEvent('download'), b.click('[data-action="download"]')]);
    expect(download.suggestedFilename()).toBe(fileName);

    const parsed = parseCollection(md);
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.items).toBe(3);
    expect(parsed.value.sources).toEqual([`${siteA.origin}/css-variables/`, `${siteB.origin}/web-components/`]);
    expect(parsed.value.groups).toEqual({ Components: ['Signup button'], Text: ['Text heading 1'], Colours: ['Color wc primary'] });
    expect(md).toContain('| hover | background-color #0f62fe → #0353e9 | stylesheet rules |');
    expect(md).toContain('`--wc-primary`');

    // One item on its own, and removing one
    await b.click('[data-action="basket-back"]');
    await b.locator('[data-item-export]').first().click();
    expect(await b.locator('[data-part="file-name"]').innerText()).toBe('127-0-0-1.component.signup-button.design.md');
    await b.click('[data-action="basket-back"]');
    await b.locator('[data-item-remove]').last().click();
    expect(await b.locator('[data-item]').count()).toBe(2);
    expect(stored.map(i => i.name)).toEqual(['Signup button', 'Text heading 1']);
    await b.click('[data-action="clear-basket"]');
    await b.click('[data-action="clear-basket-confirm"]');
    expect(stored).toEqual([]);
    await b.context().close();
  }, 60_000);
});
