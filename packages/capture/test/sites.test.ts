/// <reference lib="dom" />
/**
 * The capture tools on five local test sites, one per styling approach (PRD success measures):
 * utility classes, CSS-in-JS, CSS Modules, web components, plain CSS variables. Runs in headless
 * Chromium. Values are checked against getComputedStyle (what DevTools' Computed panel shows) on the
 * element the file's selector finds, and every file is checked against its golden file.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { SITES, captureBundle, launch, openSite, serveSites, type SiteName } from './browser.js';

const EXPECTED = fileURLToPath(new URL('../fixtures/expected/', import.meta.url));
/** The base unit each site really uses. */
const BASE_UNIT: Readonly<Record<SiteName, number>> = { utility: 4, 'css-in-js': 10, 'css-modules': 4, 'web-components': 8, 'css-variables': 4 };

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

interface SiteResult {
  eligibility: Record<string, string>;
  duplicateStyles: number;
  textWithoutRole: number;
  roles: string[];
  h1: { checks: { prop: string; file: string; browser: string }[]; selectorFinds: boolean };
  colorUsesMissing: string[];
  accent: { key: string; token: string | null } | null;
  baseUnit: number | null;
  shadowButton: { selector: string; accentToken: string | null } | null;
  component: { type: string; background: string | null; browserBackground: string; backgroundToken: string | null; hasMargin: boolean; labelSize: string | null; browserLabelSize: string; firstVariantCount: number; tokens: string[]; states: Record<string, string>; pageRestored: string };
  page: { components: string[]; systems: boolean[]; restored: boolean } | null;
  spacingSetRows: string[];
  selectorsResolve: Record<string, boolean>;
  files: { name: string; text: string; parses: boolean }[];
}

/** Everything the test checks, computed inside the page. */
async function runInPage(): Promise<SiteResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L = (window as any).LuciCapture;
  const CAPTURED = { captured: '2026-11-12' };
  const resolve = (selector: string): Element | null => {
    const parts = selector.split(' >> ');
    let root: Document | ShadowRoot = document;
    let el: Element | null = null;
    for (const part of parts) {
      el = root.querySelector(part);
      if (!el) return null;
      if (el.shadowRoot) root = el.shadowRoot;
    }
    return el;
  };
  const snap = L.snapshotPage();
  const els = snap.elements as { id: number; tag: string; selector: string; visible: boolean; hasText: boolean; inShadow: boolean; styles: Record<string, string> }[];
  const byId = (id: string) => els.find(e => e.selector === `#${id}`)!;
  const elig = (e: { tag: string; styles: Record<string, string> }) => L.eligibility({ tag: e.tag, backgroundImage: e.styles['background-image'] }).status;

  const groups = L.textGroups(snap) as { key: string; role: string }[];
  const keys = new Set(groups.map(g => g.key));
  const textEls = L.textElements(snap) as typeof els;

  const h1 = els.find(e => e.tag === 'h1' && !e.inShadow)!;
  const textToken = L.textToken(snap, h1, CAPTURED);
  const live = getComputedStyle(resolve(textToken.meta.selector)!);
  const checks = ([['family', 'font-family'], ['size', 'font-size'], ['weight', 'font-weight'], ['lineHeight', 'line-height'], ['letterSpacing', 'letter-spacing'], ['color', 'color']] as const)
    .map(([key, prop]) => ({ prop, file: textToken.style[key].computed, browser: live.getPropertyValue(prop).trim() }));

  const system = L.colorSystem(snap, CAPTURED);
  const roleKeys = new Set((system.roles as { role: string; value: { computed: string } }[]).map(r => `${r.role}|${L.colorKey(r.value.computed)}`));
  const uses = L.allColorUses(snap) as { role: string; key: string; property: string; el: { selector: string }; token?: string }[];
  const missing = uses.filter(u => !roleKeys.has(`${u.role}|${u.key}`)).map(u => `${u.el.selector} ${u.property}`);
  const accentUse = uses.find(u => u.role === 'accent' && u.property === 'background-color');
  const button = els.find(e => e.selector === accentUse?.el.selector)!;
  const colorToken = L.colorToken(snap, { element: button }, CAPTURED);

  const gapEl = els.find(e => e.visible && /flex|grid/.test(e.styles.display ?? '') && parseFloat(e.styles['column-gap'] ?? '0') > 0 && !e.inShadow)!;
  const gapUse = (L.spacingUses(gapEl) as { property: string }[]).find(u => u.property === 'column-gap');
  const spacingToken = L.spacingToken(snap, gapUse, CAPTURED);
  const lead = els.find(e => e.id > h1.id && e.tag === 'p')!;
  const distance = L.distanceToken(snap, h1, lead, CAPTURED);

  const shadowButton = els.find(e => e.inShadow && e.tag === 'button');
  const shadowUse = shadowButton ? uses.find(u => u.el.selector === shadowButton.selector && u.property === 'background-color') : undefined;

  // The Component tool on the accent button, with its variants on the page
  const liveSnap = L.liveSnapshot();
  const compEntry = liveSnap.snapshot.elements.find((e: { selector: string }) => e.selector === accentUse?.el.selector);
  // States from stylesheet rules (the reader every shell has) and the disabled attribute
  const styleBefore = resolve(compEntry.selector)!.getAttribute('style');
  const { states } = await L.readComponentStates(liveSnap, compEntry);
  const styleAfter = resolve(compEntry.selector)!.getAttribute('style');
  const component = L.componentCapture(liveSnap.snapshot, compEntry, L.insideOf(liveSnap, compEntry), { ...CAPTURED, system: true, states });
  const compLive = getComputedStyle(resolve(component.meta.selector)!);
  const containerStyles = component.anatomy[0].styles as { property: string; value: { computed: string; token?: string } }[];
  const label = (component.anatomy as { part: string; styles: { property: string; value: { computed: string } }[] }[]).find(p => p.part === 'label');
  const labelEl = (() => {
    // The label's text is the container's own text or its first text-bearing child
    const root = resolve(component.meta.selector)!;
    const walker = document.createTreeWalker(root.shadowRoot ?? root, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    return text?.parentElement ?? root;
  })();

  // The Spacing tool's "All" and the full-page reference (user request, 2026-11-13)
  const spacingSet = L.spacingSet(snap, gapEl, CAPTURED);
  const pageResult = L.capturePage(L.liveSnapshot(), {}, CAPTURED);
  const pageFile = pageResult.ok ? pageResult.output.capture : null;
  const pageStyleAfter = resolve(compEntry.selector)!.getAttribute('style');

  const captures = [textToken, colorToken, spacingToken, spacingSet, distance, L.typographySystem(snap, CAPTURED), system, L.spacingSystem(snap, CAPTURED), component, ...(pageFile ? [pageFile] : [])];
  return {
    eligibility: { image: elig(byId('logo')), hero: elig(byId('hero')), svg: elig(byId('icon')), body: elig(els.find(e => e.tag === 'body')!) },
    duplicateStyles: groups.length - keys.size,
    textWithoutRole: textEls.filter(e => !keys.has(L.styleKey(e))).length,
    roles: groups.map(g => g.role),
    h1: { checks, selectorFinds: resolve(h1.selector) !== null },
    colorUsesMissing: missing,
    accent: accentUse ? { key: accentUse.key, token: accentUse.token ?? null } : null,
    baseUnit: L.spacingSystem(snap, CAPTURED)?.baseUnit?.px ?? null,
    shadowButton: shadowButton ? { selector: shadowButton.selector, accentToken: shadowUse?.token ?? null } : null,
    component: {
      type: component.meta.type,
      background: containerStyles.find(s => s.property === 'background-color')?.value.computed ?? null,
      browserBackground: compLive.backgroundColor,
      backgroundToken: containerStyles.find(s => s.property === 'background-color')?.value.token ?? null,
      hasMargin: containerStyles.some(s => s.property.startsWith('margin')),
      labelSize: label?.styles.find(s => s.property === 'font-size')?.value.computed ?? null,
      browserLabelSize: getComputedStyle(labelEl).fontSize,
      firstVariantCount: component.variants?.[0]?.count ?? 0,
      tokens: (component.tokens as { token: string }[]).map(t => t.token),
      states: Object.fromEntries((states as { state: string; detected: boolean; method?: string; changes: { property: string; to: { computed: string } }[] }[])
        .map(s => [s.state, s.detected ? `${s.method}: ${s.changes.map(c => `${c.property}=${c.to.computed}`).join(', ')}` : 'not detected'])),
      pageRestored: JSON.stringify({ style: styleBefore === styleAfter ? 'same' : [styleBefore, styleAfter], markers: document.querySelectorAll('[data-luci-state]').length, ariaDisabled: document.querySelectorAll('[aria-disabled]').length })
    },
    page: pageFile ? {
      components: (pageFile.components as { meta: { name: string; type: string } }[]).map(c => `${c.meta.name}:${c.meta.type}`),
      systems: [pageFile.typography, pageFile.color, pageFile.spacing].map(s => s !== null),
      restored: styleBefore === pageStyleAfter && document.querySelectorAll('[data-luci-state]').length === 0
    } : null,
    spacingSetRows: (spacingSet?.values as { property: string }[] | undefined)?.map(v => v.property) ?? [],
    selectorsResolve: Object.fromEntries(captures.filter(c => c.meta.selector).map(c => [c.meta.name, resolve(c.meta.selector) !== null])),
    files: captures.map(c => {
      const text = L.formatCapture(c, { units: 'px', colors: 'hex' });
      return { name: L.captureFileName(c.meta), text, parses: L.parseCapture(text).ok };
    })
  };
}

describe.each(SITES)('capture tools on the %s site (M4)', (site) => {
  let result: SiteResult;
  beforeAll(async () => {
    const page = await openSite(browser, server.origin, site, bundle);
    result = await page.evaluate(runInPage);
    await page.close();
  }, 60_000);

  it('blocks the image and the photo background; allows SVG; the body redirects (FR4)', () => {
    expect(result.eligibility).toEqual({ image: 'blocked', hero: 'blocked', svg: 'allowed', body: 'redirected' });
  });

  it('Text: each style appears once, every text element has a role, and the h1 matches the browser (FR11, FR12)', () => {
    expect(result.duplicateStyles).toBe(0);
    expect(result.textWithoutRole).toBe(0);
    expect(result.roles).toContain('heading-1');
    expect(result.h1.selectorFinds).toBe(true);
    for (const c of result.h1.checks) expect(c.file, `${site} h1 ${c.prop}`).toBe(c.browser);
  });

  it('Color: every color a visible element uses appears with its role, and the accent is found (FR13, FR14)', () => {
    expect(result.colorUsesMissing).toEqual([]);
    expect(result.accent).not.toBeNull();
  });

  it('Spacing: the base unit matches the site\'s own scale (FR15, FR16)', () => {
    expect(result.baseUnit).toBe(BASE_UNIT[site]);
  });

  it('Component: the accent button, its label and its variants match the browser (FR7, FR10)', () => {
    const c = result.component;
    expect(c.type).toBe('button');
    expect(c.background).toBe(c.browserBackground);
    expect(c.labelSize).toBe(c.browserLabelSize);
    expect(c.hasMargin).toBe(false);
    // The three identical "Start" buttons are one variant group
    expect(c.firstVariantCount).toBe(3);
    if (site === 'css-variables') {
      expect(c.backgroundToken).toBe('--color-primary');
      expect(c.tokens).toEqual(expect.arrayContaining(['--color-primary', '--space-3', '--space-6', '--text-sm']));
    }
    if (site === 'web-components') expect(c.tokens).toContain('--wc-primary');
  });

  it('States from stylesheet rules and the disabled attribute; the page is left as it was (FR8)', () => {
    const s = result.component.states;
    expect(result.component.pageRestored).toBe(JSON.stringify({ style: 'same', markers: 0, ariaDisabled: 0 }));
    if (site === 'css-variables') {
      expect(s).toEqual({
        // Values in the browser's form: rgb(3, 83, 233) is #0353e9
        hover: 'rules: background-color=rgb(3, 83, 233)',
        focus: 'not detected',
        'focus-visible': 'rules: outline=rgb(15, 98, 254) solid 2px, outline-offset=2px',
        active: 'rules: background-color=rgb(0, 45, 156)',
        disabled: 'attribute: opacity=0.5, cursor=not-allowed'
      });
    } else if (site === 'web-components') {
      // A real <button> inside a shadow root: rules from its adopted sheet, disabled through the attribute
      expect(s['hover']).toBe('rules: background-color=rgb(109, 40, 217)');
      expect(s['disabled']).toBe('attribute: opacity=0.5, cursor=not-allowed');
    } else {
      // These sites set no state styles: nothing is guessed
      expect(s['hover']).toBe('not detected');
    }
  });

  it('Whole page: every system, the accent button among its components, the page left as it was; Spacing "All" lists every value (user request)', () => {
    expect(result.page).not.toBeNull();
    expect(result.page!.systems).toEqual([true, true, true]);
    expect(result.page!.components.some(c => c.endsWith(':button'))).toBe(true);
    expect(result.page!.restored).toBe(true);
    expect(result.spacingSetRows).toContain('column-gap');
  });

  it('every file parses, its selector finds the element, and it matches the golden file', async () => {
    for (const [name, found] of Object.entries(result.selectorsResolve)) expect(found, `${site} ${name}`).toBe(true);
    for (const f of result.files) {
      expect(f.parses, f.name).toBe(true);
      // The test server's port changes every run
      await expect(f.text.replace(/http:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:PORT')).toMatchFileSnapshot(path.join(EXPECTED, site, f.name));
    }
  });

  if (site === 'web-components') {
    it('reads inside shadow roots: the card button and its token (FR6)', () => {
      expect(result.shadowButton?.selector).toMatch(/ >> button$/);
      expect(result.shadowButton?.accentToken).toBe('--wc-primary');
    });
  }
  if (site === 'css-variables') {
    it('records tokens and authored values: var() and clamp() (FR9, decision 6)', () => {
      expect(result.accent?.token).toBe('--color-primary');
      const text = result.files.find(f => f.name.includes('.token.text-'))!.text;
      expect(text).toContain('`clamp(2rem, 2rem + 2vw, 3rem)`');
      expect(text).toContain('`--font-sans`');
      expect(text).toContain('`--color-text`');
      const colors = result.files.find(f => f.name.endsWith('.system.color.design.md'))!.text;
      expect(colors).toMatch(/\| `--color-unused` \| #da1e28 \| 0 \|/);
    });
  }
});
