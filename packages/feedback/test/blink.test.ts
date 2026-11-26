/// <reference lib="dom" />
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { baselineFromItem, diffSnapshots, expandBoxShorthand, isOffscreen, type BlinkSnapshot } from '../src/ui/blink.js';

function snap(overrides: Partial<BlinkSnapshot> = {}): BlinkSnapshot {
  return {
    styles: {
      color: 'rgb(17, 24, 39)',
      'background-color': 'rgb(15, 98, 254)',
      'padding-top': '8px',
      'padding-right': '16px',
      'padding-bottom': '8px',
      'padding-left': '16px',
      ...(overrides.styles ?? {})
    },
    rect: overrides.rect ?? { width: 120, height: 40 },
    text: overrides.text ?? 'Save'
  };
}

describe('After-Edit Blink helpers (v0.7)', () => {
  it('groups 4-sided style changes, ignores subpixel jitter, and summarizes cleanly', () => {
    const base = snap();
    // Subpixel rect jitter (< 1px) is ignored
    expect(diffSnapshots(base, snap({ rect: { width: 120.4, height: 39.6 } })).changed).toBe(false);

    // Changing all 4 padding sides + background counts as 2 logical styles, while keeping exact per-side props
    const styled = diffSnapshots(base, snap({
      styles: {
        'background-color': 'rgb(22, 163, 74)',
        'padding-top': '14px',
        'padding-right': '24px',
        'padding-bottom': '14px',
        'padding-left': '24px'
      }
    }));
    expect(styled.changed).toBe(true);
    expect(styled.props).toEqual(['background-color', 'padding']);
    expect(styled.summary).toBe('2 styles');
    expect(styled.changedStyles['padding-top']).toEqual({ before: '8px', after: '14px' });
    expect(styled.changedStyles['background-color']).toEqual({ before: 'rgb(15, 98, 254)', after: 'rgb(22, 163, 74)' });

    // Text-only edit
    const textOnly = diffSnapshots(base, snap({ text: 'Submit order' }));
    expect(textOnly.changed).toBe(true);
    expect(textOnly.summary).toBe('text');
  });

  it('detects off-screen elements relative to the viewport', () => {
    const win = { innerWidth: 1280, innerHeight: 800 };
    expect(isOffscreen({ top: 100, bottom: 140, left: 40, right: 200 }, win)).toBe(false);
    expect(isOffscreen({ top: 900, bottom: 960, left: 40, right: 200 }, win)).toBe(true);
    expect(isOffscreen({ top: -100, bottom: -20, left: 40, right: 200 }, win)).toBe(true);
  });

  it('builds pre-edit baselines from saved FeedbackItem target.styles cleanly across full reloads', () => {
    expect(expandBoxShorthand('8px 16px')).toEqual(['8px', '16px', '8px', '16px']);
    expect(expandBoxShorthand('4px 8px 12px')).toEqual(['4px', '8px', '12px', '8px']);
    expect(expandBoxShorthand('8px / 4px')).toBeNull();

    const unchanged = snap();
    // Identical saved target.styles produce zero false positives
    const sameBaseline = baselineFromItem({
      styles: { 'background-color': 'rgb(15, 98, 254)', padding: '8px 16px' }
    }, unchanged);
    expect(diffSnapshots(sameBaseline, unchanged).changed).toBe(false);

    // After a Next.js full reload where the button turned red, saved target.styles detects the change
    const reloadedRed = snap({ styles: { 'background-color': 'rgb(220, 38, 38)' } });
    const preEditBaseline = baselineFromItem({
      styles: { 'background-color': 'rgb(15, 98, 254)', padding: '8px 16px' }
    }, reloadedRed);
    const diff = diffSnapshots(preEditBaseline, reloadedRed);
    expect(diff.changed).toBe(true);
    expect(diff.props).toEqual(['background-color']);
    expect(diff.changedStyles['background-color']).toEqual({
      before: 'rgb(15, 98, 254)',
      after: 'rgb(220, 38, 38)'
    });
  });
});

describe('After-Edit Blink in Chrome (v0.7)', { timeout: 60_000 }, () => {
  let browser: Browser;
  let server: http.Server;
  let origin: string;
  let bundle: string;

  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const built = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'iife',
      globalName: 'LuciFeedback',
      platform: 'browser',
      target: 'chrome120',
      write: false,
      logLevel: 'silent'
    });
    bundle = built.outputFiles[0]!.text;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Blink test</title>
    <style id="base-css">
      body { margin: 0; font-family: sans-serif; padding: 24px; }
      #cta { background-color: rgb(15, 98, 254); color: rgb(255, 255, 255); padding: 8px 16px; border: 0; border-radius: 6px; font-size: 14px; }
      #toggle-btn { background-color: rgb(229, 231, 235); color: rgb(17, 24, 39); padding: 8px 12px; border: 0; }
      #toggle-btn.active { background-color: rgb(59, 130, 246); color: rgb(255, 255, 255); }
      #far-card { margin-top: 2200px; padding: 16px; background-color: rgb(243, 244, 246); }
    </style>
  </head>
  <body>
    <button id="cta" type="button">Buy now</button>
    <button id="toggle-btn" type="button">Toggle me</button>
    <section id="far-card">Far section</section>
    <script>
      document.getElementById('toggle-btn').addEventListener('click', function () {
        this.classList.toggle('active');
      });
    </script>
  </body>
</html>`;

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>(r => server.close(() => r()));
  });

  async function mountOnPage(page: Page, initialItems: { selector: string; element: string; comment: string }[]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(origin);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(async (items) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciFeedback;
      const store = new Map<string, string>();
      const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
      const backend = L.browserBackend(kv, 'luci.test.blink');
      for (const item of items) {
        await backend.add({
          page: { url: window.location.href, title: document.title },
          target: { kind: 'element', selector: item.selector, element: item.element },
          comment: item.comment,
          intent: 'fix',
          priority: 'high'
        });
      }
      L.mountFeedback({ doc: document, backend, settings: L.DEFAULT_FEEDBACK_SETTINGS, store: kv, onClose: () => {} });
    }, initialItems);
    await page.locator('luci-feedback [data-marker="P1-A1"]').waitFor({ state: 'visible' });
  }

  it('pulses on HMR stylesheet update, toggles Before/After peek cleanly with zero inline style residue, and shows Jump for off-screen targets', async () => {
    const page = await browser.newPage();
    try {
      await mountOnPage(page, [
        { selector: '#cta', element: 'button', comment: 'Make CTA green with larger padding' },
        { selector: '#far-card', element: 'section', comment: 'Darken card surface' }
      ]);

      // Simulate Vite/Webpack HMR stylesheet update
      await page.evaluate(() => {
        const s = document.createElement('style');
        s.id = 'hmr-update';
        s.textContent = '#cta { background-color: rgb(22, 163, 74); padding: 14px 24px; } #far-card { background-color: rgb(229, 231, 235); }';
        document.head.appendChild(s);
      });

      const ring = page.locator('luci-feedback [data-part="blink-ring"][data-ref="P1-A1"]');
      const pill = page.locator('luci-feedback [data-part="blink-pill"][data-ref="P1-A1"]');
      const bar = page.locator('luci-feedback [data-part="blink-bar"]');
      await ring.waitFor({ state: 'visible' });
      await pill.waitFor({ state: 'visible' });
      expect(await pill.innerText()).toContain('Updated · P1-A1');
      await bar.waitFor({ state: 'visible' });

      // Before/After peek reverts #cta visually to "before" and restores cleanly to "after" with no style attribute left
      const peekBtn = bar.locator('[data-action="blink-peek"]');
      await peekBtn.click();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('cta')!).backgroundColor)).toBe('rgb(15, 98, 254)');
      expect(await page.evaluate(() => document.getElementById('cta')!.getAttribute('data-luci-blink-peek'))).toBe('before');

      // Toggle off restores "after" and leaves zero inline style residue
      await peekBtn.click();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('cta')!).backgroundColor)).toBe('rgb(22, 163, 74)');
      expect(await page.evaluate(() => document.getElementById('cta')!.hasAttribute('style'))).toBe(false);
      expect(await page.evaluate(() => document.getElementById('cta')!.hasAttribute('data-luci-blink-peek'))).toBe(false);

      // Off-screen updated target offers Jump button that scrolls it into view
      const jumpBtn = bar.locator('[data-action="blink-jump"]');
      await jumpBtn.waitFor({ state: 'visible' });
      expect(await jumpBtn.innerText()).toContain('Jump to P1-A2');
      await jumpBtn.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    } finally {
      await page.close();
    }
  });

  it('ignores direct user clicks on the page and respects the After-Edit Blink Off setting', async () => {
    const page = await browser.newPage();
    try {
      await mountOnPage(page, [
        { selector: '#toggle-btn', element: 'button', comment: 'Adjust toggle styling' },
        { selector: '#cta', element: 'button', comment: 'Check CTA color' }
      ]);

      // 1. User clicks #toggle-btn directly on the page -> must NOT cause a false blink
      await page.locator('#toggle-btn').click();
      await page.waitForTimeout(400);
      expect(await page.locator('luci-feedback [data-part="blink-bar"]').count()).toBe(0);

      // 2. Turn After-Edit Blink Off in settings -> even HMR stylesheet edits do not blink
      await page.locator('luci-feedback [data-action="settings"]').click();
      await page.locator('luci-feedback [data-action="after-edit-blink-off"]').click();
      await page.evaluate(() => {
        const s = document.createElement('style');
        s.textContent = '#cta { background-color: rgb(220, 38, 38); }';
        document.head.appendChild(s);
      });
      await page.waitForTimeout(450);
      expect(await page.locator('luci-feedback [data-part="blink-ring"]').count()).toBe(0);
      expect(await page.locator('luci-feedback [data-part="blink-bar"]').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('catches CSSStyleSheet.insertRule HMR updates with zero DOM mutations and survives full page reloads via saved target.styles', async () => {
    const page = await browser.newPage();
    try {
      // 1. Mount with a note whose saved target.styles has the pre-edit color while the live button is already updated (simulates Next.js full reload)
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(origin);
      await page.addScriptTag({ content: bundle });
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).LuciFeedback;
        const store = new Map<string, string>();
        const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
        const backend = L.browserBackend(kv, 'luci.test.blink.reload');
        // Live button is rgb(15, 98, 254), saved note says it used to be rgb(28, 28, 30)
        await backend.add({
          page: { url: window.location.href, title: document.title },
          target: {
            kind: 'element',
            selector: '#cta',
            element: 'button',
            styles: { 'background-color': 'rgb(28, 28, 30)' }
          },
          comment: 'Turn button blue',
          intent: 'fix',
          priority: 'medium'
        });
        L.mountFeedback({ doc: document, backend, settings: L.DEFAULT_FEEDBACK_SETTINGS, store: kv, onClose: () => {} });
      });

      const bar = page.locator('luci-feedback [data-part="blink-bar"]');
      await bar.waitFor({ state: 'visible', timeout: 5000 });
      expect(await bar.innerText()).toContain('Updated P1-A1');

      // Peek shows the pre-reload charcoal color, then dismiss advances baseline
      await bar.locator('[data-action="blink-peek"]').click();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('cta')!).backgroundColor)).toBe('rgb(28, 28, 30)');
      await bar.locator('[data-action="blink-dismiss"]').click();
      await bar.waitFor({ state: 'detached' });

      // 2. CSSStyleSheet.insertRule (zero DOM mutations!) still triggers Blink via lightweight poll
      await page.evaluate(() => {
        const sheet = (document.getElementById('base-css') as HTMLStyleElement).sheet!;
        sheet.insertRule('#cta { background-color: rgb(220, 38, 38) !important; }', sheet.cssRules.length);
      });
      await bar.waitFor({ state: 'visible', timeout: 4000 });
      expect(await bar.innerText()).toContain('Updated P1-A1');
    } finally {
      await page.close();
    }
  });
});
