/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { formatCapture, formatLayoutTree } from '@luci-dev/format/capture';
import { captureBundle, launch, openSite, serveSites } from './browser.js';
import { computeElementLayout } from '../src/layout.js';
import type { ElementSnapshot } from '../src/model.js';

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

describe('Computed Layout Tree (v0.4.3)', () => {
  it('extracts flex and grid container and item layout styles', () => {
    const flexContainer: ElementSnapshot = {
      id: 1,
      tag: 'div',
      role: null,
      selector: '.flex',
      rect: { x: 0, y: 0, width: 800, height: 100 },
      visible: true,
      hasText: false,
      inShadow: false,
      styles: {
        display: 'flex',
        'flex-direction': 'column',
        'flex-wrap': 'wrap',
        'justify-content': 'space-between',
        'align-items': 'center',
        gap: '16px'
      },
      authored: {}
    };

    const flexChild: ElementSnapshot = {
      id: 2,
      tag: 'button',
      role: 'button',
      selector: '.btn',
      rect: { x: 0, y: 0, width: 100, height: 40 },
      visible: true,
      hasText: true,
      inShadow: false,
      parent: 1,
      styles: {
        display: 'inline-flex',
        'align-self': 'flex-end',
        'flex-grow': '1',
        order: '2'
      },
      authored: {}
    };

    const containerLayout = computeElementLayout(flexContainer);
    expect(containerLayout).toBeDefined();
    expect(containerLayout?.display).toBe('flex');
    expect(containerLayout?.direction).toBe('column');
    expect(containerLayout?.wrap).toBe('wrap');
    expect(containerLayout?.justifyContent).toBe('space-between');
    expect(containerLayout?.alignItems).toBe('center');
    expect(containerLayout?.gap).toBe('16px');

    const childLayout = computeElementLayout(flexChild, flexContainer);
    expect(childLayout).toBeDefined();
    expect(childLayout?.parentLayout).toBe('flex');
    expect(childLayout?.alignSelf).toBe('flex-end');
    expect(childLayout?.flexGrow).toBe('1');
    expect(childLayout?.order).toBe('2');
  });

  it('captures computed layout tree from live page components with flex layout', async () => {
    const page: Page = await openSite(browser, server.origin, 'utility', bundle);
    try {
      const capture = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lc = (window as any).LuciCapture;
        const snap = lc.snapshotPage(document);
        const headerEl = snap.elements.find((e: any) => e.tag === 'header');
        if (!headerEl) throw new Error('Header not found');
        return lc.componentCapture(snap, headerEl, (el: any) => {
          let depth = 0;
          for (let p = el.parent; p !== undefined; p = snap.elements[p]?.parent) {
            depth++;
            if (p === headerEl.id) return depth;
          }
          return el.id === headerEl.id ? 0 : null;
        });
      });

      expect(capture.layoutTree).toBeDefined();
      expect(capture.layoutTree.part).toBe('container');
      expect(capture.layoutTree.element).toContain('header');
      expect(capture.layoutTree.layout?.display).toBe('flex');
      expect(capture.layoutTree.layout?.justifyContent).toBe('space-between');
      expect(capture.layoutTree.layout?.alignItems).toBe('center');

      // Anatomy parts have parent and depth pointers
      expect(capture.anatomy[0]!.part).toBe('container');
      expect(capture.anatomy[0]!.depth).toBe(0);
      expect(capture.anatomy.length).toBeGreaterThan(1);

      for (let i = 1; i < capture.anatomy.length; i++) {
        expect(capture.anatomy[i]!.depth).toBeGreaterThanOrEqual(1);
        expect(capture.anatomy[i]!.parent).toBeDefined();
      }

      // Formatting with layoutTree: true generates ## Layout Tree
      const formatted = formatCapture(capture, { layoutTree: true });
      expect(formatted).toContain('## Layout Tree');
      expect(formatted).toContain('- **container** (header (banner)) — flex (justify: space-between, align: center)');

      const outline = formatLayoutTree(capture.layoutTree);
      expect(outline).toContain('container');
      expect(outline).toContain('flex');
    } finally {
      await page.close();
    }
  });

  it('captures computed layout tree for sections with grid and flex containers', async () => {
    const page: Page = await openSite(browser, server.origin, 'utility', bundle);
    try {
      const section = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lc = (window as any).LuciCapture;
        const snap = lc.snapshotPage(document);
        const mainEl = snap.elements.find((e: any) => e.tag === 'main');
        if (!mainEl) throw new Error('Main not found');
        const groups = lc.sectionGroups(snap, mainEl, (el: any) => {
          let depth = 0;
          for (let p = el.parent; p !== undefined; p = snap.elements[p]?.parent) {
            depth++;
            if (p === mainEl.id) return depth;
          }
          return el.id === mainEl.id ? 0 : null;
        });
        const components = groups.map((g: any) => ({
          entry: g.example,
          inside: (el: any) => (el.id === g.example.id ? 0 : 1),
          states: []
        }));
        return lc.sectionCapture(snap, mainEl, (el: any) => {
          for (let p = el.parent; p !== undefined; p = snap.elements[p]?.parent) {
            if (p === mainEl.id) return 1;
          }
          return el.id === mainEl.id ? 0 : null;
        }, groups, components).section;
      });

      expect(section.layoutTree).toBeDefined();
      expect(section.layoutTree.part).toBe('container');
      expect(section.structure.length).toBeGreaterThan(1);

      // Structure items include parent pointers
      for (let i = 1; i < section.structure.length; i++) {
        expect(section.structure[i]!.parent).toBeDefined();
      }

      const formatted = formatCapture(section, { layoutTree: true });
      expect(formatted).toContain('## Layout Tree');
    } finally {
      await page.close();
    }
  });
});
