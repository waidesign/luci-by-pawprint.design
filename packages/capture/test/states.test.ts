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

  it('leaves no marker on the elements around the component', async () => {
    const page = await open('states');
    await forcedStates(page, '#lift-card');
    expect(await page.evaluate(() => document.querySelectorAll('[data-luci-state], [data-luci-state-up]').length)).toBe(0);
    await page.close();
  });

  it('works inside shadow roots, and a hover done in JavaScript is not detected by forcing alone', async () => {
    const page = await open('web-components');
    expect((await forcedStates(page, 'plan-card:nth-of-type(1) >> button')).states['hover']).toBe('forced: background-color=rgb(109, 40, 217)');
    await page.close();
    const vars = await open('css-variables');
    expect((await forcedStates(vars, '#js-hover')).states['hover']).toBe('not detected');
    await vars.close();
  });
});

type CaptureResult = { states: { state: string; detected: boolean; method?: string; trigger?: { element: string; selector: string; depth: number } }[]; markdown: string; restored: boolean };

/** The whole Component tool path the extension takes: states through the debugger (with a pointer point), then the file. */
async function captureWithDebugger(page: Page, selector: string, debuggerOn = true): Promise<CaptureResult> {
  return page.evaluate(async ({ sel, on }) => {
    const w = window as unknown as Win & { cdpSend: (m: string, p?: object) => Promise<unknown> };
    const L = w.LuciCapture;
    const el = document.querySelector(sel)!;
    const styleBefore = el.getAttribute('style');
    const live = L.liveSnapshot();
    const entry = live.entryFor(el);
    const reader = on ? (count: number, options: object) => L.readStatesViaCdp(w.cdpSend, count, options) : undefined;
    const { states } = await L.readComponentStates(live, entry, reader);
    const r = L.captureComponent(live, entry, {}, { states });
    return {
      states,
      markdown: r.output.markdown as string,
      restored: el.getAttribute('style') === styleBefore && document.querySelectorAll('[data-luci-state], [data-luci-state-up]').length === 0
    };
  }, { sel: selector, on: debuggerOn });
}

describe('states like a real pointer (user reports 2026-11-13: evernote.com, lattice.com)', () => {
  let page: Page;
  beforeAll(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const session = await page.context().newCDPSession(page);
    await page.exposeFunction('cdpSend', (method: string, params?: object) => session.send(method as 'DOM.enable', params as never));
    await page.goto(`${server.origin}/states/`);
    await page.addScriptTag({ content: bundle });
  });
  afterAll(async () => { await page.close(); });

  const row = (md: string, state: string) => md.split('\n').find(l => l.startsWith(`| ${state} |`)) ?? '';

  it('a card that lifts when the link AROUND it is hovered (group-hover): the lift, the shadow, and what fades in, with the trigger named', async () => {
    const { states, markdown, restored } = await captureWithDebugger(page, '#lift-card');
    const hover = states.find(s => s.state === 'hover')!;
    expect(hover).toMatchObject({ detected: true, method: 'forced', trigger: { element: 'a (link)', selector: '#group-link', depth: 1 } });
    const line = row(markdown, 'hover');
    expect(line).toContain('On the a (link) around it (`#group-link`, 1 level up): ');
    // Readable movement, not matrix(...)
    expect(line).toContain('transform none → translateY(-12px)');
    expect(line).toContain('box-shadow');
    // The image and the arrow have no text: still read, as decorations
    expect(line).toContain('decoration opacity 0 → 1');
    expect(line).toContain('decoration transform rotate(90deg) scale(0.5) → translate(-20px, 20px)');
    expect(line).toContain('decoration-2 transform rotate(45deg) → translateX(8px) rotate(45deg)');
    expect(line).not.toContain('matrix(');
    // The anatomy names them and says they appear on hover; each keeps its own motion
    expect(markdown).toMatch(/\n- decoration — div, appears on hover: .*opacity 0.*transform rotate\(90deg\) scale\(0\.5\)/);
    expect(markdown).toMatch(/\n- decoration-2 — span, appears on hover: /);
    expect(markdown).toContain('\n- transition all 0.3s cubic-bezier(0.4, 0, 0.2, 1)\n');
    expect(markdown).toContain('\n- decoration: transition all 0.3s cubic-bezier(0.4, 0, 0.2, 1)\n');
    expect(markdown).toContain('\n- decoration-2: transition transform 0.2s ease-out\n');
    // Focus goes to the link around it: its focus-visible ring on the card is found and attributed
    expect(row(markdown, 'focus-visible')).toContain('On the a (link) around it (`#group-link`, 1 level up): outline');
    expect(restored).toBe(true);
  });

  it('a change on a decorative element with no text (lattice.com) is read', async () => {
    const { markdown } = await captureWithDebugger(page, '#dot-item');
    expect(row(markdown, 'hover')).toContain('decoration background-color #e4e4e7 → #16a34a');
  });

  it('a hover done in JavaScript is read with a real pointer; a card with no hover says "No change"', async () => {
    const js = await captureWithDebugger(page, '#js-lift');
    expect(js.states.find(s => s.state === 'hover')).toMatchObject({ detected: true, method: 'pointer' });
    const hover = row(js.markdown, 'hover');
    expect(hover).toContain('transform none → translateY(-6px)');
    expect(hover).toContain('box-shadow none → ');
    expect(hover).toMatch(/ \| browser, pointer moved onto it \|$/);
    expect(js.restored).toBe(true);
    const plain = await captureWithDebugger(page, '#plain');
    expect(row(plain.markdown, 'hover')).toBe('| hover | No change | browser, pointer moved onto it |');
    expect(row(plain.markdown, 'active')).toBe('| active | No change | browser, state forced |');
  });

  it('without the debugger, stylesheet rules on the element around it are read too, and say so', async () => {
    const { states, markdown } = await captureWithDebugger(page, '#lift-card', false);
    expect(states.find(s => s.state === 'hover')).toMatchObject({ detected: true, method: 'rules', trigger: { element: 'a (link)', depth: 1 } });
    expect(row(markdown, 'hover')).toContain('transform none → translateY(-12px)');
    expect(row(markdown, 'focus')).toBe('| focus | Not in the stylesheets: it may change through JavaScript. Capture it by hand in Luci. | stylesheet rules |');
  });
});
