/// <reference lib="dom" />
/**
 * The loader (user request, 2026-11-13): while Luci reads the page it shows a spinner and what it is
 * doing; Whole page reports its steps. Reading in steps gives exactly the same file as before.
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

async function open(site: string, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion });
  page.setDefaultTimeout(5000);
  await page.goto(`${server.origin}/${site}/`);
  await page.addScriptTag({ content: bundle });
  return page;
}

describe('loader', { timeout: 60_000 }, () => {
  it('Whole page in steps: the same file as in one go, with every step reported in order', async () => {
    const page = await open('images');
    const r = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const steps: string[] = [];
      const inSteps = await L.capturePageInSteps(document, { units: 'px' }, { captured: '2026-11-13', onStep: (s: string) => steps.push(s) });
      const inOne = L.capturePage(L.liveSnapshot(), { units: 'px' }, { captured: '2026-11-13' });
      return { steps, same: inSteps.output.markdown === inOne.output.markdown, components: inOne.output.capture.components.length };
    });
    expect(r.same).toBe(true);
    expect(r.steps[0]).toBe('Reading the page');
    expect(r.steps.at(-1)).toBe('Text styles, colors and spacing');
    expect(r.steps.slice(1, -1)).toEqual(Array.from({ length: r.steps.length - 2 }, (_, i) => `Components ${i + 1} of ${r.steps.length - 2}: states and images`));
    expect(r.steps.length - 2).toBeGreaterThanOrEqual(r.components);
    await page.close();
  });

  it('toolbar: Whole page shows the spinner and its steps, then the file', async () => {
    const page = await open('css-variables');
    // Record every step the loader shows (it can be quick)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).LuciCapture.mountToolbar();
      const w = window as unknown as { seen: string[]; spun: boolean };
      w.seen = [];
      w.spun = false;
      const root = document.querySelector('luci-toolbar')!.shadowRoot!;
      new MutationObserver(() => {
        const step = root.querySelector('[data-part="busy-step"]')?.textContent;
        if (step && w.seen.at(-1) !== step) w.seen.push(step);
        const spinner = root.querySelector('[data-part="busy"] .spinner');
        if (spinner && getComputedStyle(spinner).animationName === 'luci-spin') w.spun = true;
      }).observe(root, { subtree: true, childList: true, characterData: true });
    });
    await page.click('[data-action="whole-page"]');
    await page.locator('[data-part="file-name"]').waitFor();
    const { seen, spun } = await page.evaluate(() => ({ seen: (window as unknown as { seen: string[] }).seen, spun: (window as unknown as { spun: boolean }).spun }));
    expect(spun).toBe(true);
    expect(seen[0]).toBe('Reading the page');
    expect(seen).toContain('Text styles, colors and spacing');
    expect(seen.some(s => /^Components 1 of \d+/.test(s))).toBe(true);
    expect(await page.locator('[data-part="busy"]').count()).toBe(0);
    await page.close();
  });

  it('the spinner pulses in place of spinning when the system asks for less motion', async () => {
    const page = await open('css-variables', 'reduce');
    const name = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).LuciCapture.mountToolbar();
      const root = document.querySelector('luci-toolbar')!.shadowRoot!;
      const s = document.createElement('span');
      s.className = 'spinner';
      root.querySelector('.luci')!.appendChild(s);
      return getComputedStyle(s).animationName;
    });
    expect(name).toBe('luci-pulse');
    await page.close();
  });
});
