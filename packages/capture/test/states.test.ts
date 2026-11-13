/// <reference lib="dom" />
/**
 * Component states through the debugger (FR8): the same Chrome DevTools Protocol commands the
 * extension sends, here through a Playwright CDP session, on real pages.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { readStatesViaCdp } from '../src/index.js';
import { captureBundle, launch, serveSites } from './browser.js';

let browser: Browser;
let server: Awaited<ReturnType<typeof serveSites>>;
let bundle: string;
beforeAll(async () => {
  [browser, server, bundle] = await Promise.all([launch(), serveSites(), captureBundle()]);
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

type Summary = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win = Window & { LuciCapture: any; luciTargets: any; luciRestore: () => void };

/** Prepare the component in the page, read its states through CDP from here, then turn the reading into states there. */
async function forcedStates(page: Page, selector: string): Promise<{ states: Summary; restored: boolean }> {
  const count = await page.evaluate((sel: string) => {
    const w = window as unknown as Win;
    const L = w.LuciCapture;
    const parts = sel.split(' >> ');
    let root: Document | ShadowRoot = document;
    let el: Element | null = null;
    for (const p of parts) { el = root.querySelector(p); if (el?.shadowRoot) root = el.shadowRoot; }
    const live = L.liveSnapshot();
    const targets = L.stateTargets(live, live.entryFor(el));
    w.luciTargets = targets;
    w.luciRestore = L.prepareTargets(targets);
    return targets.length as number;
  }, selector);
  const session = await page.context().newCDPSession(page);
  const reading = await readStatesViaCdp((method, params) => session.send(method as 'DOM.enable', params as never), count);
  await session.detach();
  return page.evaluate((r: unknown) => {
    const w = window as unknown as Win;
    const states = w.LuciCapture.statesFromForced(w.luciTargets, r) as { state: string; detected: boolean; method?: string; changes: { part?: string; property: string; to: { computed: string } }[] }[];
    w.luciRestore();
    const el = w.luciTargets[0].el as Element;
    return {
      states: Object.fromEntries(states.map(s => [s.state, s.detected ? `${s.method}: ${s.changes.map(c => `${c.part ? `${c.part} ` : ''}${c.property}=${c.to.computed}`).join(', ')}` : 'not detected'])),
      restored: !el.hasAttribute('style') || el.getAttribute('style') === w.luciTargets[0].style, // no inline style left behind
    };
  }, reading);
}

async function open(site: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(`${server.origin}/${site}/`);
  await page.addScriptTag({ content: bundle });
  return page;
}

describe('states through the debugger (M5.3)', () => {
  it('forces hover, focus-visible and active and reads final values (transitions switched off for the read)', async () => {
    const page = await open('css-variables');
    const { states, restored } = await forcedStates(page, 'li:nth-of-type(1) > a');
    expect(states).toEqual({
      // The 150ms transition would otherwise show the first frame, the resting color
      hover: 'forced: background-color=rgb(3, 83, 233)',
      // Forcing :focus alone does not trigger :focus-visible styles; nothing else changes on focus
      focus: 'not detected',
      'focus-visible': 'forced: outline=rgb(15, 98, 254) solid 2px, outline-offset=2px',
      active: 'forced: background-color=rgb(0, 45, 156)'
    });
    expect(restored).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('[data-luci-state]').length)).toBe(0);
    await page.close();
  });

  it('works inside shadow roots, and a hover done in JavaScript is not detected', async () => {
    const page = await open('web-components');
    expect((await forcedStates(page, 'plan-card:nth-of-type(1) >> button')).states['hover']).toBe('forced: background-color=rgb(109, 40, 217)');
    await page.close();
    const vars = await open('css-variables');
    expect((await forcedStates(vars, '#js-hover')).states['hover']).toBe('not detected');
    await vars.close();
  });
});
