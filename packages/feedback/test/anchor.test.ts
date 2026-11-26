/// <reference lib="dom" />
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { stalenessNotice } from '../src/ui/builder.js';
import type { TeamReview } from '@luci-dev/format/feedback';

describe('Team Feedback anchor matching and staleness (pure + browser)', { timeout: 60_000 }, () => {
  let browser: Browser;
  let bundle: string;

  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const built = build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'LuciFeedback', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
    [browser, bundle] = await Promise.all([chromium.launch(), built.then(r => r.outputFiles[0]!.text)]);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('places unique anchors, asks to confirm ambiguous duplicates, and reports unplaced cleanly', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`
      <main style="padding: 40px;">
        <section>
          <h1>Pricing</h1>
          <button id="hero-cta" style="padding: 8px 16px;">Start free trial</button>
        </section>
        <section style="display: flex; gap: 24px; margin-top: 40px;">
          <article class="card"><button class="buy">Choose plan</button></article>
          <article class="card"><button class="buy">Choose plan</button></article>
        </section>
      </main>
    `);
    await page.addScriptTag({ content: bundle });

    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciFeedback;
      // 1. Exact selector + text + tag -> placed
      const placed = L.matchAnchor(document, {
        element: 'button',
        text: 'Start free trial',
        selector: '#hero-cta',
        position: [10, 12]
      });
      // 2. Changed selector, but unique text + tag -> still placed
      const movedSelector = L.matchAnchor(document, {
        element: 'button',
        text: 'Start free trial',
        selector: '#old-missing-id',
        position: [10, 12]
      });
      // 3. Ambiguous duplicate buttons with no selector -> confirm (never guess!)
      const ambiguous = L.matchAnchor(document, {
        element: 'button',
        text: 'Choose plan'
      });
      // 4. Completely missing element -> unplaced
      const unplaced = L.matchAnchor(document, {
        element: 'button',
        text: 'Nonexistent action',
        selector: '#gone'
      });
      return {
        placedStatus: placed.status,
        placedId: placed.el?.id,
        movedStatus: movedSelector.status,
        movedId: movedSelector.el?.id,
        ambiguousStatus: ambiguous.status,
        ambiguousCount: ambiguous.candidates?.length ?? 0,
        unplacedStatus: unplaced.status,
        summary: L.anchorSummary({ element: 'button', text: 'Nonexistent action', component: 'HeroCTA' }, '/pricing')
      };
    });

    expect(res.placedStatus).toBe('placed');
    expect(res.placedId).toBe('hero-cta');
    expect(res.movedStatus).toBe('placed');
    expect(res.movedId).toBe('hero-cta');
    expect(res.ambiguousStatus).toBe('confirm');
    expect(res.ambiguousCount).toBe(2);
    expect(res.unplacedStatus).toBe('unplaced');
    expect(res.summary).toBe('button "Nonexistent action" in HeroCTA on /pricing');
    await page.close();
  });

  it('detects stale reviews against project lastModifiedAt or >7 days offline fallback', () => {
    const rev: TeamReview = {
      version: 1,
      reviewer: { name: 'Maya', role: 'PM' },
      site: 'https://staging.example.com',
      createdAt: '2026-11-10T10:00:00.000Z',
      notes: [{ id: '1', path: '/', note: 'Fix spacing' }]
    };
    expect(stalenessNotice([rev], '2026-11-19T12:00:00.000Z')).toBe('This review is from 2026-11-10 — your app changed more recently.');
    expect(stalenessNotice([rev], '2026-11-09T12:00:00.000Z')).toBeNull();
    // Offline fallback (>7 days)
    expect(stalenessNotice([rev], undefined, Date.parse('2026-11-20T10:00:00.000Z'))).toContain('more than 7 days old');
    expect(stalenessNotice([rev], undefined, Date.parse('2026-11-12T10:00:00.000Z'))).toBeNull();
  });

  it('B-41: supports shadow DOM >> selectors, omits transparent/modern background, and handles local origin', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`
      <div id="host" style="padding: 20px;"></div>
      <div id="transparent-box" style="color: rgb(20, 20, 20); background-color: rgb(0 0 0 / 0); padding: 10px;">Transparent Box</div>
    `);
    await page.evaluate(() => {
      const host = document.getElementById('host')!;
      const shadow = host.attachShadow({ mode: 'open' });
      const btn = document.createElement('button');
      btn.id = 'shadow-btn';
      btn.textContent = 'Inside Shadow';
      btn.style.padding = '8px 16px';
      shadow.appendChild(btn);
    });
    await page.addScriptTag({ content: bundle });

    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciFeedback;
      const host = document.getElementById('host')!;
      const btn = host.shadowRoot!.getElementById('shadow-btn')!;
      const selector = L.selectorFor(btn, document);
      const found = L.querySelectorDeep(document, selector);

      const transparentBox = document.getElementById('transparent-box')!;
      const captured = L.captureReviewElement(transparentBox, document, window);

      return {
        selector,
        foundId: found?.id,
        bg: captured.measured.background,
        color: captured.measured.color
      };
    });

    expect(res.selector).toContain('>>');
    expect(res.foundId).toBe('shadow-btn');
    expect(res.bg).toBeUndefined();
    expect(res.color).toBe('#141414');
    await page.close();
  });

  it('B-42: reviewer popovers use sheet layout below 640px viewport (no inline top/left)', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.setContent(`
      <main style="padding: 20px;">
        <button id="cta" style="padding: 8px 16px;">Buy now</button>
      </main>
    `);
    await page.addScriptTag({ content: bundle });

    const inlineStyle = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciFeedback;
      let savedNotes: any[] = [];
      const store = {
        loadIdentity: async () => ({ name: 'Tester', role: 'Designer' }),
        saveIdentity: async () => {},
        loadSimpleMode: async () => true,
        saveSimpleMode: async () => {},
        loadNotes: async () => savedNotes,
        saveNotes: async (_origin: string, notes: any[]) => { savedNotes = notes; }
      };
      const handle = L.mountReviewer({ doc: document, store });
      await new Promise(r => setTimeout(r, 50));

      const host = handle.host as HTMLElement;
      const shadow = host.shadowRoot!;
      // Wait for identity to load and enable annotate button
      let annotateBtn: HTMLButtonElement | null = null;
      for (let i = 0; i < 20; i++) {
        annotateBtn = shadow.querySelector('[data-action="annotate"]:not([disabled])') as HTMLButtonElement;
        if (annotateBtn) break;
        await new Promise(r => setTimeout(r, 50));
      }
      annotateBtn?.click();

      // Wait for pick layer to mount
      let pickLayer: HTMLElement | null = null;
      for (let i = 0; i < 20; i++) {
        pickLayer = shadow.querySelector('[data-part="pick-layer"]') as HTMLElement;
        if (pickLayer) break;
        await new Promise(r => setTimeout(r, 50));
      }

      // Click on the pick layer over the cta button
      const cta = document.getElementById('cta')!;
      const r = cta.getBoundingClientRect();
      pickLayer?.dispatchEvent(new MouseEvent('click', { clientX: r.left + 5, clientY: r.top + 5, bubbles: true }));

      // Wait for note form popover to appear
      let pop: HTMLElement | null = null;
      for (let i = 0; i < 20; i++) {
        pop = shadow.querySelector('[data-part="reviewer-note-form"]') as HTMLElement;
        if (pop) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const style = pop ? { top: pop.style.top, left: pop.style.left } : null;
      handle.destroy();
      return style;
    });

    expect(inlineStyle).toEqual({ top: '', left: '' });
    await page.close();
  });
});
