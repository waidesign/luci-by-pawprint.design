/// <reference lib="dom" />
/**
 * Launch-blocker regressions from the 2026-11-20 bug review, on the "regressions" fixture: a page
 * rebuilt from the review's reference site (a Tailwind v3 + shadcn page), with no network.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { buildBaseline, type ColorSystem, type ComponentCapture, type SpacingSystem } from '@luci-dev/format/capture';
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

async function open(width = 1280): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(10_000);
  await page.goto(`${server.origin}/regressions/`);
  await page.addScriptTag({ content: bundle });
  return page;
}

/** A Component capture of one element, in the page. */
async function component(page: Page, selector: string): Promise<{ capture: ComponentCapture; markdown: string }> {
  const r = await page.evaluate((sel) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).LuciCapture;
    const live = L.liveSnapshot();
    const out = L.captureComponent(live, live.entryFor(document.querySelector(sel)), { units: 'px', colors: 'hex' });
    return out.ok ? { capture: out.output.capture, markdown: out.output.markdown } : { error: out.message };
  }, selector);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('B-01: background shorthand with a variable', () => {
  it('keeps background-color and its token in Anatomy and Tokens, and counts the token', async () => {
    const page = await open();
    const { capture, markdown } = await component(page, '#brand-btn');
    const container = capture.anatomy.find(p => p.part === 'container')!;
    const bg = container.styles.find(s => s.property === 'background-color');
    expect(bg?.value).toMatchObject({ computed: 'rgb(15, 98, 254)', token: '--brand' });
    expect(capture.tokens.map(t => t.token)).toContain('--brand');
    expect(markdown).toMatch(/background-color #0f62fe \(`--brand`\)/);

    const color = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      return L.colorSystem(L.snapshotPage());
    }) as ColorSystem;
    expect(color.tokens.find(t => t.token === '--brand')?.count).toBe(1);
    await page.close();
  });
});

describe('B-02: shadcn bare-HSL tokens and library variables', () => {
  it('lists the bare-channel tokens with their color and uses; leaves out --tw-* and unused library variables', async () => {
    const page = await open();
    const color = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      return L.colorSystem(L.snapshotPage());
    }) as ColorSystem;
    const tokens = new Map(color.tokens.map(t => [t.token, t]));
    expect(tokens.get('--foreground')).toMatchObject({ value: 'hsl(20 14.3% 4.1%)' });
    expect(tokens.get('--foreground')!.count).toBeGreaterThan(0);
    expect(tokens.get('--background')?.count).toBeGreaterThan(0);
    expect(tokens.get('--border')?.count).toBeGreaterThan(0);
    // Defined and unused, still the project's own palette
    expect(tokens.has('--primary')).toBe(true);
    expect([...tokens.keys()].filter(t => t.startsWith('--tw-') || t.startsWith('--toastify-'))).toEqual([]);
    // The roles carry the token they go through
    expect(color.roles.find(r => r.value.token === '--foreground')).toBeTruthy();
    await page.close();
  });

  it('luci capture baseline reads the same bare channels from the stylesheet', () => {
    const css = `:root { --background: 0 0% 100%; --foreground: 20 14.3% 4.1%; --toastify-color-error: #e74c3c; --tw-ring-color: #3b82f680; }
body { color: hsl(var(--foreground)); background-color: hsl(var(--background)); }`;
    const baseline = buildBaseline([{ file: 'app/globals.css', text: css }], { project: 'demo', captured: '2026-11-20' });
    const fg = baseline.color!.tokens.find(t => t.token === '--foreground');
    expect(fg).toMatchObject({ count: 1 });
    expect(fg!.value).toMatch(/^rgb\(12, 10, 9\)$/);
    expect(baseline.tokens.some(t => t.token.startsWith('--tw-'))).toBe(false);
  });
});

describe('B-04: Tailwind --tw-* plumbing', () => {
  it('never shows up in a component\'s tokens, anatomy or variants', async () => {
    const page = await open();
    const { capture, markdown } = await component(page, '#tw-btn');
    expect(capture.tokens).toEqual([]);
    expect(markdown).not.toContain('--tw-');
    expect(markdown).not.toContain('(set on an ancestor)');
    const bg = capture.anatomy[0]!.styles.find(s => s.property === 'background-color');
    expect(bg?.value).toEqual({ computed: 'rgb(224, 193, 43)' });
    expect(markdown).toMatch(/background-color #e0c12b/);
    await page.close();
  });
});

describe('B-05: margin auto', () => {
  it('centering margins are not spacing steps, outliers or the base unit', async () => {
    const page = await open();
    const spacing = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      return L.spacingSystem(L.snapshotPage());
    }) as SpacingSystem;
    // The main is 960px wide in a 1280px window (160px each side); the narrow section 400px in 928px (264px)
    const values = [...spacing.scale, ...spacing.outliers].map(v => v.value.computed);
    expect(values).not.toContain('160px');
    expect(values).not.toContain('264px');
    expect(values).toEqual(expect.arrayContaining(['8px', '16px', '24px']));
    await page.close();
  });

  it('when stylesheets cannot be read, large equal margins of a centered block are left out too', async () => {
    const page = await open();
    const spacing = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage();
      // As with a cross-origin sheet: nothing authored is known
      for (const e of snap.elements) e.authored = {};
      snap.stylesReadable = false;
      return L.spacingSystem(snap);
    }) as SpacingSystem;
    const values = [...spacing.scale, ...spacing.outliers].map(v => v.value.computed);
    expect(values).not.toContain('160px');
    expect(values).not.toContain('264px');
    await page.close();
  });

  it('Whole page leaves them out as well', async () => {
    const page = await open();
    const md = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const out = L.capturePage(L.liveSnapshot(), { units: 'px', colors: 'hex' }, { captured: '2026-11-20' });
      return out.ok ? out.output.markdown as string : out.message as string;
    });
    const spacingSection = md.split('\n## Spacing')[1]?.split('\n## ')[0] ?? md;
    expect(md).toContain('\n## Spacing');
    expect(spacingSection).not.toMatch(/\b(160|264)px\b/);
    await page.close();
  });
});

/** A page made of this HTML, with the capture bundle in it. */
async function pageOf(html: string, width = 1280): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(10_000);
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui">${html}</body></html>`);
  await page.addScriptTag({ content: bundle });
  return page;
}

/** A Component capture with its states read from the stylesheet rules (no debugger), as a file. */
async function withStates(page: Page, selector: string): Promise<string> {
  return await page.evaluate(async (sel) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).LuciCapture;
    const live = L.liveSnapshot();
    const entry = live.entryFor(document.querySelector(sel));
    const { states } = await L.readComponentStates(live, entry);
    const out = L.captureComponent(live, entry, { units: 'px', colors: 'hex' }, { states });
    return out.ok ? out.output.markdown as string : `ERROR ${out.message}`;
  }, selector);
}

describe('B-06: typography roles', () => {
  it('text in an inline wrapper inside a heading names the heading; spacing variants fold; fine print is a caption', async () => {
    const page = await pageOf(`
      <h1 style="font-size:36px;font-weight:700;margin:0"><div style="display:flex;flex-direction:column"><span>Classic decoders</span></div></h1>
      <h3 style="font-size:36px;font-weight:600;margin:0">Sub</h3>
      <p style="font-size:16px;line-height:24px">One</p><p style="font-size:16px;line-height:24px">Two</p>
      <p style="font-size:16px;line-height:26px;letter-spacing:0.01em">Three</p>
      <p style="font-size:8px">Fine print</p>`);
    const roles = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      return (L.typographySystem(L.snapshotPage()).roles as { role: string; count: number; style: { lineHeight: { computed: string } } }[])
        .map(r => ({ role: r.role, count: r.count, lineHeight: r.style.lineHeight.computed }));
    });
    expect(roles.map(r => r.role).sort()).toEqual(['body', 'caption', 'heading-1', 'heading-1-bold']);
    // The three paragraphs are one role, with the line height most of them use
    expect(roles.find(r => r.role === 'body')).toEqual({ role: 'body', count: 3, lineHeight: '24px' });
    await page.close();
  });
});

describe('B-07: what a card is', () => {
  it('only a bounded box is a card: not a star icon, a full-width band, a paragraph, table cells or an inline circle', async () => {
    const page = await pageOf(`
      <div id="star" style="width:16px;height:16px;background:#00b67a"></div>
      <section id="band" style="background:#f4f4f4;padding:40px"><p id="quote" style="border-left:4px solid #ccc;padding-left:12px">Quote</p></section>
      <table id="t" style="border-collapse:collapse"><tr id="tr" style="background:#eee"><th id="th" style="background:#ddd;padding:8px">Model</th><td id="td" style="border:1px solid #ccc;padding:8px">X1</td></tr></table>
      <span id="avatar" style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#fc0"></span>
      <div id="card" style="width:300px;height:240px;border:1px solid #ddd;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.2)">Card</div>`);
    const types = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const width = L.pageWidthOf(live.snapshot);
      return Object.fromEntries(['star', 'band', 'quote', 'tr', 'th', 'td', 'avatar', 'card'].map(id => [id, L.componentType(live.entryFor(document.getElementById(id)), width)]));
    });
    expect(Object.entries(types).filter(([, t]) => t === 'card').map(([id]) => id)).toEqual(['card']);
    await page.close();
  });
});

describe('B-08: one entry per kind, no duplicated children', () => {
  it('a styled table is one entry; a nav inside the header is described by the header', async () => {
    const page = await pageOf(`
      <header style="display:flex;padding:16px;border-bottom:1px solid #ddd"><nav style="display:flex;gap:16px"><a href="#a">A</a><a href="#b">B</a></nav></header>
      <table style="border-collapse:collapse;margin:24px"><thead><tr style="background:#eee"><th style="background:#ddd;padding:8px">Model</th></tr></thead>
        <tbody><tr><td style="border:1px solid #ccc;padding:8px;background:#fafafa">X1</td></tr></tbody></table>`);
    const types = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const out = L.capturePage(L.liveSnapshot(), { units: 'px' }, { captured: '2026-11-20' });
      return (out.output.capture.components as { meta: { type: string; selector: string } }[]).map(c => c.meta.type);
    });
    expect(types).toEqual(['header', 'link', 'table']);
    await page.close();
  });

  it('forms and footers list their controls in Anatomy the way the header does', async () => {
    const page = await pageOf(`
      <form id="f" style="padding:16px"><div><div><div><div><input type="text" placeholder="Email"><button>Submit</button></div></div></div></div></form>
      <footer id="ft" style="padding:16px"><div><nav><ul><li><a href="#home">Home</a></li><li><a href="#about">About</a></li></ul></nav></div></footer>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const formOut = L.captureComponent(live, live.entryFor(document.getElementById('f')), {});
      const footerOut = L.captureComponent(live, live.entryFor(document.getElementById('ft')), {});
      return {
        formParts: formOut.output.capture.anatomy.map((p: any) => p.part),
        footerParts: footerOut.output.capture.anatomy.map((p: any) => p.part)
      };
    });
    expect(res.formParts).toContain('field');
    expect(res.formParts).toContain('action');
    expect(res.footerParts).toContain('link');
    await page.close();
  });
});

describe('B-10: a field deep in wrappers', () => {
  it('is named field, never decoration', async () => {
    // The form's own state changes the input, five levels down (past the anatomy's depth)
    const page = await pageOf(`
      <style>#f:hover input { border-color: #0f62fe; }</style>
      <form id="f" style="padding:16px;border:1px solid #ddd"><div><div><div><div><input id="email" type="email" placeholder="Email" style="border:1px solid #999"></div></div></div></div></form>`);
    const md = await withStates(page, '#f');
    expect(md).not.toContain('decoration');
    expect(md).toMatch(/\| hover \| [^\n]*field/);
    await page.close();
  });
});

describe('B-11: state diffs from stylesheet rules', () => {
  const css = `<style>
    :root { --brand: #0f62fe; }
    * { --tw-ring-offset-shadow: 0 0 #0000; --tw-ring-shadow: 0 0 #0000; --tw-shadow: 0 0 #0000; }
    button { font: inherit; padding: 8px 16px; border: 0; }
    .ghost { background-color: transparent; } .ghost:hover { background-color: initial; }
    .outline-none:focus-visible { outline: 2px solid transparent; outline-offset: 2px; }
    .ring:focus-visible { outline: 2px solid transparent; --tw-ring-shadow: 0 0 0 2px var(--brand);
      box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000); }
    .shadow { box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); } .shadow:hover { box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
  </style>`;

  it('no "transparent → initial", no change to the same shadow, "outline-none" is no visible focus, a ring is', async () => {
    const page = await pageOf(`${css}
      <button id="ghost" class="ghost">Ghost</button>
      <button id="plain" class="outline-none" style="background:#eee">Plain</button>
      <button id="ring" class="ring outline-none" style="background:#eee">Ring</button>
      <button id="shadow" class="shadow" style="background:#eee">Shadow</button>`);
    const ghost = await withStates(page, '#ghost');
    expect(ghost).not.toContain('initial');
    expect(ghost).not.toMatch(/\| hover \| [^\n]*background-color/);

    const plain = await withStates(page, '#plain');
    expect(plain).not.toMatch(/\| Focus visible \|[^\n]*\| Yes \|/);
    expect(plain).not.toMatch(/\| focus-visible \|[^\n]*outline/);

    const ring = await withStates(page, '#ring');
    expect(ring).toMatch(/\| focus-visible \| [^\n]*box-shadow/);
    expect(ring).toMatch(/\| Focus visible \|[^\n]*box-shadow[^\n]*\| Yes \|/);

    const shadow = await withStates(page, '#shadow');
    expect(shadow).not.toMatch(/\| hover \| [^\n]*box-shadow/);
    await page.close();
  });

  it('a state on the element itself never makes an element around the component its trigger', async () => {
    const page = await pageOf(`${css}
      <div role="tabpanel" tabindex="0" class="outline-none"><form id="f" style="padding:16px;border:1px solid #ddd"><input class="outline-none" style="outline:1px solid #999"></form></div>`);
    const md = await withStates(page, '#f');
    expect(md).not.toMatch(/around it/i);
    await page.close();
  });
});

describe('B-13: an unreadable stylesheet', () => {
  it('gives no element a width it did not set, and a fluid width is shown as written', async () => {
    const page = await pageOf(`
      <header id="h" style="width:100%;display:flex;padding:16px;background:#111;color:#fff"><a id="a" href="#x" style="color:#fff">Home</a></header>`);
    const md = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      live.snapshot.stylesReadable = false; // as with one cross-origin sheet (a font service's)
      const out = L.captureComponent(live, live.entryFor(document.getElementById('h')), { units: 'px', colors: 'hex' });
      return out.output.markdown as string;
    });
    const container = /- container — [^\n]*/.exec(md)![0];
    expect(container).toContain('width 100%');
    expect(container).not.toMatch(/width 1280px/);
    const link = /- link — [^\n]*/.exec(md)![0];
    expect(link).not.toMatch(/(?<![-\w])(width|height) /);
    await page.close();
  });

  it('shows image fluid or auto width as auto rather than subpixel px from aspect ratio', async () => {
    const page = await pageOf(`
      <footer id="ft" style="display:flex;padding:16px;background:#111">
        <img id="img" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'></svg>" style="width:auto;height:32px">
      </footer>`);
    const md = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureComponent(live, live.entryFor(document.getElementById('ft')), { units: 'px', colors: 'hex' });
      return out.output.markdown as string;
    });
    const imgLine = /- image — [^\n]*/.exec(md)?.[0];
    expect(imgLine).toContain('width auto');
    expect(imgLine).toContain('height 32px');
    await page.close();
  });
});

describe('B-27: a page whose root font size is not 16px', () => {
  it('writes rem on the page\'s own root, and the design check reads a rem design the same way', async () => {
    const page = await pageOf(`<style>html { font-size: 10px; } #b { padding: 20px 12px; font-size: 16px; border: 0; background: #0f62fe; color: #fff; }</style>
      <button id="b">Go</button>`);
    const r = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const entry = live.entryFor(document.getElementById('b'));
      const remFile = L.captureComponent(live, entry, { units: 'rem' }).output.markdown as string;
      // The design as a designer writes it for this site: rem against its 10px root
      const check = await L.checkAgainst(live, entry, { label: 'design', file: 'design.design.md', markdown: remFile });
      return { remFile, ok: check.ok, differences: check.ok ? check.result.differences.map((d: { property: string; expected: string; actual: string }) => `${d.property}: ${d.expected} / ${d.actual}`) : [check.message] };
    });
    expect(r.remFile).toMatch(/padding 2rem 1\.2rem/);
    expect(r.ok).toBe(true);
    expect(r.differences).toEqual([]);
    await page.close();
  });
});

describe('B-17: responsive component capture', () => {
  it('reports a 3-column grid that becomes 1 column on a phone', async () => {
    const page = await open();
    const responsive = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      return await L.readResponsive(live, live.entryFor(document.querySelector('#grid')), 'component', { timeoutMs: 8000 });
    }) as { widths: number[]; queries: string[]; changes: { part: string; property: string; values: string[] }[] };
    expect(responsive.queries).toEqual(['(max-width: 768px)']);
    expect(responsive.changes).toContainEqual({ part: 'container', property: 'grid-template-columns', values: ['1 column', '3 columns'] });
    await page.close();
  });
});

describe('B-03: dominant authored and token population in colorSystem and spacingSystem', () => {
  it('populates authored and token for hsl(var(--foreground)) and dominant spacing authored value', async () => {
    const page = await pageOf(`
      <style>
        :root { --foreground: 222.2 84% 4.9%; }
        .item-rem { padding: 1rem; color: hsl(var(--foreground)); }
        .item-px { padding: 16px; color: hsl(var(--foreground)); }
      </style>
      <div id="root">
        <div class="item-rem">1</div>
        <div class="item-rem">2</div>
        <div class="item-rem">3</div>
        <div class="item-rem">4</div>
        <div class="item-rem">5</div>
        <div class="item-rem">6</div>
        <div class="item-rem">7</div>
        <div class="item-rem">8</div>
        <div class="item-rem">9</div>
        <div class="item-px">10</div>
      </div>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage(document);
      const colors = L.colorSystem(snap);
      const spacing = L.spacingSystem(snap);
      return { colors, spacing };
    });
    const textRole = r.colors?.roles.find((x: any) => x.role === 'text');
    expect(textRole?.value.token).toBe('--foreground');
    expect(textRole?.value.authored).toBe('hsl(var(--foreground))');

    const scale16 = r.spacing?.scale.find((x: any) => x.value.computed === '16px');
    expect(scale16?.value.authored).toBe('1rem');
    await page.close();
  });
});

describe('B-18: CSS custom properties on body / theme scopes and var() resolution', () => {
  it('resolves variables defined on body and references to var(--accent)', async () => {
    const page = await pageOf(`
      <style>
        body { --accent: #0d47a1; }
        .btn { background-color: var(--accent); color: #fff; padding: 8px; }
      </style>
      <button class="btn">Click me</button>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage(document);
      const colors = L.colorSystem(snap);
      return {
        customProperties: snap.customProperties,
        colors
      };
    });
    expect(r.customProperties['--accent']).toBe('#0d47a1');
    expect(r.colors?.tokens.some((t: any) => t.token === '--accent')).toBe(true);
    await page.close();
  });
});

describe('B-19: .sr-only visually hidden elements marked visible: false', () => {
  it('marks visually hidden elements visible: false', async () => {
    const page = await pageOf(`
      <style>
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
      </style>
      <button id="btn">
        <svg width="16" height="16"><rect width="16" height="16" /></svg>
        <span class="sr-only">Close</span>
      </button>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage(document);
      const spanEntry = snap.elements.find((e: any) => e.selector.includes('.sr-only') || e.tag === 'span');
      return { visible: spanEntry?.visible };
    });
    expect(r.visible).toBe(false);
    await page.close();
  });
});

describe('B-09: collapse identical sibling parts in anatomy and accessibility', () => {
  it('collapses 6 identical sibling links into link with count 6 and 1 contrast row', async () => {
    const page = await pageOf(`
      <style>
        header { display: flex; gap: 8px; background: #000; padding: 12px; }
        header a { color: #fff; text-decoration: none; font-size: 14px; }
      </style>
      <header id="hdr">
        <a href="#1">Link 1</a>
        <a href="#2">Link 2</a>
        <a href="#3">Link 3</a>
        <a href="#4">Link 4</a>
        <a href="#5">Link 5</a>
        <a href="#6">Link 6</a>
      </header>
    `);
    const r = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureComponent(live, live.entryFor(document.getElementById('hdr')), { units: 'px', colors: 'hex' });
      return { capture: out.output.capture, markdown: out.output.markdown };
    });
    const linkParts = r.capture.anatomy.filter((p: any) => p.part.startsWith('link'));
    expect(linkParts.length).toBe(1);
    expect(linkParts[0].count).toBe(6);
    expect(r.markdown).toContain('- link (×6) — a (link)');
    const contrastRows = r.capture.accessibility?.contrast ?? [];
    expect(contrastRows.length).toBe(1);
    await page.close();
  });

  it('renumbers subsequent distinct parts sequentially so next distinct part is link-2, not link-7 (B-101)', async () => {
    const page = await pageOf(`
      <style>
        header { display: flex; gap: 8px; background: #000; padding: 12px; }
        .std { color: #fff; text-decoration: none; font-size: 14px; }
        .diff { color: #f00; text-decoration: underline; font-size: 18px; }
      </style>
      <header id="hdr2">
        <a class="std" href="#1">Link 1</a>
        <a class="std" href="#2">Link 2</a>
        <a class="std" href="#3">Link 3</a>
        <a class="std" href="#4">Link 4</a>
        <a class="std" href="#5">Link 5</a>
        <a class="std" href="#6">Link 6</a>
        <a class="diff" href="#7">Distinct Link</a>
      </header>
    `);
    const r = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureComponent(live, live.entryFor(document.getElementById('hdr2')), { units: 'px', colors: 'hex' });
      return { capture: out.output.capture, markdown: out.output.markdown };
    });
    const linkParts = r.capture.anatomy.filter((p: any) => p.part.startsWith('link'));
    expect(linkParts.length).toBe(2);
    expect(linkParts[0].part).toBe('link');
    expect(linkParts[0].count).toBe(6);
    expect(linkParts[1].part).toBe('link-2');
    expect(r.markdown).toContain('- link (×6) — a (link)');
    expect(r.markdown).toContain('- link-2 — a (link)');
    await page.close();
  });
});

describe('B-12: canonical component selection prefers text-bearing and largest variant group', () => {
  it('picks text link over logo link, and CTA button over 1-use icon button', async () => {
    const page = await pageOf(`
      <style>
        .icon-btn { width: 32px; height: 32px; background: transparent; border: 1px solid #ccc; }
        .cta-btn { width: 120px; height: 40px; background: #0f62fe; color: #fff; font-size: 14px; border: 0; }
        .logo-link { display: inline-block; width: 40px; height: 40px; }
        .nav-link { color: #333; font-size: 16px; text-decoration: underline; }
      </style>
      <header>
        <a class="logo-link" href="/"><svg width="40" height="40"><rect width="40" height="40" /></svg></a>
        <button class="icon-btn" id="icon-b"><svg width="16" height="16"><circle r="8" cx="8" cy="8" /></svg></button>
      </header>
      <nav>
        <a class="nav-link" href="/1">Page 1</a>
        <a class="nav-link" href="/2">Page 2</a>
        <a class="nav-link" href="/3">Page 3</a>
        <a class="nav-link" href="/4">Page 4</a>
        <a class="nav-link" href="/5">Page 5</a>
        <a class="nav-link" href="/6">Page 6</a>
        <a class="nav-link" href="/7">Page 7</a>
        <a class="nav-link" href="/8">Page 8</a>
        <a class="nav-link" href="/9">Page 9</a>
        <a class="nav-link" href="/10">Page 10</a>
      </nav>
      <main>
        <button class="cta-btn" id="cta-1">Start now</button>
        <button class="cta-btn" id="cta-2">Start now</button>
        <button class="cta-btn" id="cta-3">Start now</button>
        <button class="cta-btn" id="cta-4">Start now</button>
        <button class="cta-btn" id="cta-5">Start now</button>
        <button class="cta-btn" id="cta-6">Start now</button>
        <button class="cta-btn" id="cta-7">Start now</button>
        <button class="cta-btn" id="cta-8">Start now</button>
      </main>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage(document);
      const components = L.pageComponents(snap);
      return components.map((c: any) => ({ tag: c.tag, selector: c.selector, hasText: c.hasText }));
    });
    const link = r.find((c: any) => c.selector.includes('nav') || (c.tag === 'a' && c.hasText));
    expect(link).toBeDefined();
    expect(link?.selector).toBe('nav > a:nth-of-type(1)');
    expect(link?.hasText).toBe(true);

    const button = r.find((c: any) => c.selector.includes('cta-1') || (c.tag === 'button' && c.hasText));
    expect(button).toBeDefined();
    expect(button?.selector).toBe('#cta-1');
    expect(button?.hasText).toBe(true);
    await page.close();
  });
});

describe('B-14: overlay contrast over image reports check by eye instead of hard fail', () => {
  it('does not emit level fail for text over overlapping sibling img and reports check by eye', async () => {
    const page = await pageOf(`
      <style>
        .hero { position: relative; width: 400px; height: 300px; }
        .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); }
        .scrim h1 { color: #ffffff; font-size: 24px; padding: 20px; }
      </style>
      <div class="hero" id="hero">
        <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" alt="hero" />
        <div class="scrim">
          <h1>White text</h1>
        </div>
      </div>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const snap = L.snapshotPage(document);
      const textEl = snap.elements.find((e: any) => e.tag === 'h1')!;
      const c = L.contrastOf(snap, textEl);
      return { contrast: c };
    });
    expect(r.contrast.level).not.toBe('fail');
    expect(r.contrast.overImage).toBe(true);
    await page.close();
  });
});

describe('B-15: composite form accessibility checks child interactive controls and text', () => {
  it('does not emit nothing to check on composite forms with nested inputs and buttons', async () => {
    const page = await pageOf(`
      <style>
        form { padding: 20px; background: #fff; }
        input { padding: 8px; border: 1px solid #ccc; }
        button { padding: 8px 16px; background: #0f62fe; color: #fff; border: 0; }
      </style>
      <form id="f">
        <div><div><div><div>
          <input type="text" placeholder="Email" />
          <button><span>Go</span></button>
        </div></div></div></div>
      </form>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureComponent(live, live.entryFor(document.getElementById('f')), { units: 'px', colors: 'hex' });
      return { markdown: out.output.markdown, accessibility: out.output.capture.accessibility };
    });
    expect(r.markdown).not.toContain('Nothing to check: no text, and nothing to click or focus');
    const parts = r.accessibility?.contrast?.map((c: any) => c.part);
    expect(parts).toContain('field');
    expect(parts).toContain('action');
    await page.close();
  });
});

describe('B-20: readDisabled restores aria-disabled and rulesOf ignores disabled sheets', () => {
  it('restores aria-disabled="false" after readDisabled and ignores sheet.disabled = true in rules', async () => {
    const page = await pageOf(`
      <style id="disabled-sheet">a:hover { color: red; }</style>
      <style id="active-sheet">a:hover { color: blue; }</style>
      <a id="link" href="#" aria-disabled="false">Link</a>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const link = document.getElementById('link')!;
      const sheet = (document.getElementById('disabled-sheet') as HTMLStyleElement).sheet!;
      sheet.disabled = true;

      const disabledState = L.readDisabled([{ part: 'container', el: link }]);
      const attrAfter = link.getAttribute('aria-disabled');

      const rulesStates = L.readStatesFromRules([{ part: 'container', el: link }]);
      const hover = rulesStates.find((s: any) => s.state === 'hover');
      const hoverColor = hover?.changes.find((c: any) => c.property === 'color')?.to.computed;

      return { attrAfter, disabledState, hoverColor };
    });
    expect(r.attrAfter).toBe('false');
    expect(r.hoverColor).toBe('rgb(0, 0, 255)');
    await page.close();
  });
});

describe('B-21: partsAt traverses shadow selectors (>>)', () => {
  it('resolves elements across shadow roots without throwing syntax errors', async () => {
    const page = await pageOf(`
      <my-card id="card"></my-card>
      <script>
        const host = document.getElementById('card');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button id="btn" style="padding: 10px; background: red;">Click</button>';
      </script>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const parts = L.partsAt(document, 'component', 'my-card >> button');
      return { parts };
    });
    expect(r.parts).toBeDefined();
    expect(r.parts?.some((p: any) => p.part === 'container' || p.part === 'action')).toBe(true);
    await page.close();
  });
});

describe('B-22: section capture recurses into children of text-bearing elements', () => {
  it('captures inline link inside text paragraph in structure', async () => {
    const page = await pageOf(`
      <section id="sec">
        <p>Read the <a href="#" id="doc-link">docs</a> for details.</p>
      </section>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const secEl = live.entryFor(document.getElementById('sec'));
      const inside = L.insideOf(live, secEl);
      const groups = L.sectionGroups(live.snapshot, secEl, inside);
      const inputs = groups.map((g: any) => ({ entry: g.example, inside: L.insideOf(live, g.example), states: [], images: [] }));
      const { section } = L.sectionCapture(live.snapshot, secEl, inside, groups, inputs);
      return { structure: section.structure };
    });
    expect(r.structure.some((s: any) => s.element.includes('link') || s.part.includes('link'))).toBe(true);
    await page.close();
  });
});

describe('B-25: componentColorSet authored prioritizes tokened use', () => {
  it('updates group.authored when a tokened use is encountered after a raw use', async () => {
    const page = await pageOf(`
      <style>
        :root { --ink: #111111; }
        .raw { color: #111111; }
        .tok { background-color: var(--ink); }
      </style>
      <div id="comp">
        <div class="raw">Raw</div>
        <div class="tok">Token</div>
      </div>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const comp = live.entryFor(document.getElementById('comp'));
      const inside = L.insideOf(live, comp);
      const colorSet = L.componentColorSet(live.snapshot, comp, inside);
      return colorSet;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inkGroup = r.colors.find((c: any) => c.value?.token === '--ink');
    expect(inkGroup).toBeDefined();
    expect(inkGroup.value.authored).toBe('var(--ink)');
    await page.close();
  });
});

describe('B-37: remapOutput updates output.markdown and usedFor receives CSS property names', () => {
  it('updates markdown with remapped tokens and usedFor contains background-color', async () => {
    const page = await pageOf(`
      <style>
        .btn { background: #0f62fe; padding: 12px; color: #fff; }
      </style>
      <button class="btn" id="b1">Button 1</button>
    `);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const b1 = live.entryFor(document.getElementById('b1'));
      const res = L.captureComponent(live, b1, { units: 'px', colors: 'hex' });
      const remapped = L.remapOutput(res.output, [{ token: '--my-primary', value: '#0f62fe' }]);
      return {
        markdown: remapped.output.markdown,
        token: remapped.output.capture.tokens[0]
      };
    });
    expect(r.markdown).toContain('--my-primary');
    expect(r.token.token).toBe('--my-primary');
    expect(r.token.usedFor).toContain('background-color');
    expect(r.token.usedFor).not.toContain('container');
    await page.close();
  });
});

describe('B-95: input anatomy includes typed-text and placeholder styles', () => {
  it('includes font-size, color, and placeholder-color on input container anatomy', async () => {
    const page = await pageOf(`
      <style>
        input { font-size: 14px; font-weight: 500; color: #112233; padding: 8px; border: 1px solid #ccc; }
        input::placeholder { color: #8899aa; }
      </style>
      <input id="in" type="text" placeholder="Type here" />
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const out = L.captureComponent(live, live.entryFor(document.getElementById('in')), { units: 'px', colors: 'hex' });
      return {
        markdown: out.output.markdown,
        containerStyles: out.output.capture.anatomy[0]?.styles
      };
    });
    expect(res.markdown).toContain('font-size 14px');
    expect(res.markdown).toContain('color #112233');
    expect(res.markdown).toContain('placeholder-color #8899aa');
    await page.close();
  });
});

describe('B-96: variants leave out border color when border width is 0', () => {
  it('does not list border-top-color when border-width is 0', async () => {
    const page = await pageOf(`
      <style>
        .link-a { border: 0px solid #000; color: #111; text-decoration: underline; }
        .link-b { border: 0px solid #e7e5e4; color: #222; text-decoration: underline; }
      </style>
      <div>
        <a class="link-a" id="la" href="#a">Link A</a>
        <a class="link-b" id="lb" href="#b">Link B</a>
      </div>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const la = live.entryFor(document.getElementById('la'));
      const out = L.captureComponent(live, la, { units: 'px', colors: 'hex' }, { system: true });
      return { variants: out.output.capture.variants };
    });
    expect(res.variants?.length).toBeGreaterThan(0);
    const diffProps = res.variants?.flatMap((v: any) => v.differences.map((d: any) => d.property));
    expect(diffProps).not.toContain('border-top-color');
    await page.close();
  });
});

describe('B-97: token fallback reported when variable is not set', () => {
  it('reports not set; falls back to 0px when unset variable has a fallback', async () => {
    const page = await pageOf(`
      <footer id="ft" style="padding: calc(2.5rem + var(--global-sticky-cta-height, 0px));">Footer</footer>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const ft = live.entryFor(document.getElementById('ft'));
      const out = L.captureComponent(live, ft, { units: 'px', colors: 'hex' });
      return {
        tokens: out.output.capture.tokens
      };
    });
    expect(res.tokens).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = res.tokens?.find((t: any) => t.token === '--global-sticky-cta-height');
    expect(token).toBeDefined();
    expect(token.value).toBe('not set; falls back to 0px');
    await page.close();
  });
});

describe('B-98: real button elements appear in button component and retain variants', () => {
  it('prioritizes real button elements over button-styled a links in whole page button component', async () => {
    const page = await pageOf(`
      <style>
        .cta { display: inline-block; padding: 12px 24px; background: #0f62fe; color: #fff; border: 0; }
        .acc { display: flex; width: 100%; padding: 16px; background: transparent; border: 0; color: #000; font-size: 18px; }
        .a-btn { display: inline-block; padding: 8px 16px; background: #222; color: #fff; border: 1px solid #444; width: 120px; height: 40px; }
      </style>
      <div>
        <button class="cta" id="cta1">Sign up</button>
        <button class="cta" id="cta2">Log in</button>
        <button class="acc">Accordion 1</button>
        <button class="acc">Accordion 2</button>
        <button class="acc">Accordion 3</button>
        <a class="a-btn" href="#1">Link Btn 1</a>
        <a class="a-btn" href="#2">Link Btn 2</a>
        <a class="a-btn" href="#3">Link Btn 3</a>
        <a class="a-btn" href="#4">Link Btn 4</a>
      </div>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const pageCapture = L.capturePage(live, { units: 'px', colors: 'hex' });
      const buttonComp = pageCapture.output.capture.components.find((c: any) => c.meta.name === 'button' || c.meta.name === 'primary-button');
      return {
        buttonElement: buttonComp?.anatomy[0]?.element,
        buttonVariants: buttonComp?.variants?.length ?? 0
      };
    });
    expect(res.buttonElement).toBe('button');
    expect(res.buttonVariants).toBeGreaterThan(1);
    await page.close();
  });
});

describe('B-99: only bounded boxes are cards; transparent divider wrappers are not cards', () => {
  it('does not classify a transparent wrapper with only border-bottom as a card or card variant', async () => {
    const page = await pageOf(`
      <style>
        .real-card { width: 320px; height: 180px; background: #fafafa; border: 1px solid #d4d4d4; padding: 16px; border-radius: 4px; }
        .divider-row { width: 800px; height: 60px; background: transparent; border-bottom: 1px solid #000; }
      </style>
      <div>
        <div class="real-card" id="c1"><p>Card 1</p></div>
        <div class="real-card" id="c2"><p>Card 2</p></div>
        <div class="divider-row" id="d1"><p>Divider Row 1</p></div>
        <div class="divider-row" id="d2"><p>Divider Row 2</p></div>
      </div>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const cardType = L.componentType(live.entryFor(document.getElementById('c1')));
      const dividerType = L.componentType(live.entryFor(document.getElementById('d1')));
      const c1 = live.entryFor(document.getElementById('c1'));
      const cardComp = L.captureComponent(live, c1, { units: 'px', colors: 'hex' }, { system: true });
      const variants = cardComp.output.capture.variants ?? [];
      return {
        cardType,
        dividerType,
        hasDividerInCardVariants: variants.some((v: any) => v.selector.includes('divider-row'))
      };
    });
    expect(res.cardType).toBe('card');
    expect(res.dividerType).toBe('div');
    expect(res.hasDividerInCardVariants).toBe(false);
    await page.close();
  });
});

describe('B-100: forms, headers and footers check target size for controls, and inputs get text and placeholder contrast', () => {
  it('checks target size for controls in composites and reads placeholder contrast on inputs without false failures on cards', async () => {
    const page = await pageOf(`
      <style>
        form { display: block; width: 400px; padding: 20px; }
        input { font-size: 14px; color: #112233; padding: 8px; width: 200px; height: 40px; }
        input::placeholder { color: #8899aa; }
        button { font-size: 16px; color: #fff; background: #0f62fe; width: 100px; height: 44px; border: 0; }
        .card { width: 300px; height: 200px; background: #fff; }
      </style>
      <div>
        <form id="fm">
          <div>
            <input id="in" type="text" placeholder="Type here" />
            <button id="btn" type="button">Submit</button>
          </div>
        </form>
        <div id="cd" class="card"><p>Card text</p></div>
      </div>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const live = L.liveSnapshot();
      const fm = live.entryFor(document.getElementById('fm'));
      const cd = live.entryFor(document.getElementById('cd'));
      const formOut = L.captureComponent(live, fm, { units: 'px', colors: 'hex' });
      const cardOut = L.captureComponent(live, cd, { units: 'px', colors: 'hex' });
      return {
        formTarget: formOut.output.capture.accessibility?.target,
        formContrast: formOut.output.capture.accessibility?.contrast,
        cardTarget: cardOut.output.capture.accessibility?.target
      };
    });
    expect(res.formTarget).toBeDefined();
    expect(res.formTarget.level).toBe('AAA');
    expect(res.cardTarget).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeholderContrast = res.formContrast?.find((c: any) => c.part === 'field-placeholder');
    expect(placeholderContrast).toBeDefined();
    expect(placeholderContrast.text).toBe('rgb(136, 153, 170)');
    await page.close();
  });
});

describe('Whole-page ## Sections blueprint', () => {
  it('lists top-level sections after Spacing and before Components with variant references (including Next.js #__next wrappers and top announcement aside)', async () => {
    const page = await pageOf(`
      <style>
        body { margin: 0; font-family: system-ui, sans-serif; }
        aside { padding: 8px 24px; background: #0d1738; color: #fff; }
        header { display: flex; justify-content: space-between; padding: 16px 24px; background: #fff; }
        section { padding: 64px 24px; }
        #pricing { background: #f8fafd; }
        .card { border: 1px solid #d4dee9; border-radius: 8px; padding: 20px; background: #fff; }
        .btn { padding: 10px 20px; border-radius: 6px; border: 0; background: #0f62fe; color: #fff; }
        footer { padding: 32px 24px; background: #111827; color: #fff; }
      </style>
      <div id="__next">
        <div>
          <aside><a href="/news" style="color:#fff">New release</a></aside>
          <header><a href="/">Home</a><a href="/docs">Docs</a></header>
          <main>
            <section>
              <h1>Build faster</h1>
              <p>Ship clean UI.</p>
              <button class="btn">Get started</button>
            </section>
            <section id="pricing">
              <h2>Pricing</h2>
              <div class="card"><p>Starter</p></div>
              <div class="card"><p>Pro</p></div>
            </section>
            <section>
              <h2>FAQ</h2>
              <button class="btn">Contact sales</button>
            </section>
          </main>
          <footer><a href="/privacy" style="color:#fff">Privacy</a></footer>
        </div>
      </div>
    `);
    const res = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciCapture;
      const out = L.capturePage(L.liveSnapshot(), { units: 'px', colors: 'hex' }, { captured: '2026-11-21' });
      return out.ok ? { sections: out.output.capture.sections, markdown: out.output.markdown as string } : { error: out.message };
    });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(res.sections.map((s: any) => s.name)).toEqual(['announcement', 'header', 'hero', 'pricing', 'section-2', 'footer']);
    const pricing = res.sections.find((s: { name: string }) => s.name === 'pricing');
    expect(pricing.components).toEqual([{ name: 'card', count: 2 }]);
    const hero = res.sections.find((s: { name: string }) => s.name === 'hero');
    expect(hero.components).toEqual([{ name: 'primary-button', count: 1 }]);
    expect(res.markdown.indexOf('## Sections')).toBeGreaterThan(res.markdown.indexOf('## Spacing'));
    expect(res.markdown.indexOf('## Components')).toBeGreaterThan(res.markdown.indexOf('## Sections'));
    await page.close();
  });
});







