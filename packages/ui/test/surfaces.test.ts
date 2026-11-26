/**
 * The brand kit's checks for every Luci surface (the brand kit's build guide, section 8): no colour
 * values outside the tokens, and no coloured or Charcoal strokes on components.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOOLBAR_CSS } from '@luci-dev/capture';
import { FEEDBACK_CSS } from '@luci-dev/feedback';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const SURFACES = ['packages/ui/src', 'packages/capture/src/ui', 'packages/feedback/src/ui', 'packages/toolbar/src', 'packages/extension/entrypoints'];
// Generated from the kit: the only files that hold colour values
const GENERATED = ['packages/ui/src/tokens.ts', 'packages/ui/src/mascot/art.ts', 'packages/ui/src/fonts.data.ts'];

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return files(rel);
    return /\.(ts|tsx|html|css)$/.test(e.name) && !e.name.endsWith('.css') ? [rel] : [];
  });
}

describe('surfaces use the tokens only', () => {
  it('no hex colour outside the generated token and art files', () => {
    const found: string[] = [];
    for (const f of SURFACES.flatMap(files)) {
      if (GENERATED.includes(f)) continue;
      // Example text inside a placeholder is words for the person, not a colour Luci uses
      // (and an example in a comment is not a colour either)
      const text = readFileSync(join(root, f), 'utf8').replace(/placeholder="[^"]*"/g, '')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
      for (const m of text.matchAll(/#[0-9a-f]{3,8}\b(?![-\w])/gi)) {
        const line = text.slice(0, m.index).split('\n').length;
        found.push(`${f}:${line} ${m[0]}`);
      }
    }
    expect(found).toEqual([]);
  });
  it('no rgb(), hsl() or named colours in the surface styles', () => {
    for (const css of [TOOLBAR_CSS, FEEDBACK_CSS]) {
      const own = css.replace(/:host, :root \{[\s\S]*?\n\}/, '');
      expect(own).not.toMatch(/\b(rgba?|hsla?)\(/);
      expect(own).not.toMatch(/:\s*(white|black)\b/);
    }
  });
});

describe('strokes (the brand kit, section 4)', () => {
  /** Rules as [selector, declarations], at any nesting depth. */
  const rules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1]!.trim(), m[2]!] as const);
  // Not components: overlays Luci draws over the host page while picking, measuring and planning,
  // and the loader's turning ring
  const OVERLAYS = /^(\.luci-theme )?\.(highlight|pad|margin|sel|handle|ins|drop-line|wf-row-handle|spinner)\b/;
  const COLOURED = /var\(--luci-color-(ginger|collar-lime|nose-pink|iris-gold|success|warning|danger|info|primary|link|accent|tool-active|pick|insert|muzzle-900|ink)\b/;

  it('no border or outline in ginger, lime, pink, gold, a status colour or solid Charcoal, except the focus ring', () => {
    const bad: string[] = [];
    for (const css of [TOOLBAR_CSS, FEEDBACK_CSS]) {
      for (const [selector, body] of rules(css)) {
        if (OVERLAYS.test(selector)) continue;
        for (const decl of body.split(';')) {
          const [prop, value] = decl.split(/:(.*)/s).map(s => s?.trim() ?? '');
          if (!prop || !/^(border(-(top|right|bottom|left))?(-color)?|outline(-color)?)$/.test(prop)) continue;
          const focusRing = /^outline/.test(prop) && /:focus-visible/.test(selector);
          if (!focusRing && COLOURED.test(value ?? '')) bad.push(`${selector} { ${prop}: ${value} }`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it('no left-border accent stripes and no borders thicker than 1 px on components', () => {
    for (const css of [TOOLBAR_CSS, FEEDBACK_CSS]) {
      for (const [selector, body] of rules(css)) {
        if (OVERLAYS.test(selector) || /\.wf-block/.test(selector)) continue;
        expect(body, selector).not.toMatch(/border-left\s*:\s*[2-9]px/);
        expect(body, selector).not.toMatch(/border(-(top|right|bottom|left))?(-width)?\s*:\s*[2-9]px/);
      }
    }
  });
});

describe('B-68: WCAG AA contrast & valid tokens', () => {
  const TOKENS_CSS = readFileSync(join(root, 'packages/ui/src/tokens.css'), 'utf8');
  const STYLES_TS = readFileSync(join(root, 'packages/ui/src/styles.ts'), 'utf8');

  it('every var(--luci-*) in surface styles is defined in tokens.css or base styles', () => {
    const defined = new Set<string>();
    for (const m of (TOKENS_CSS + '\n' + STYLES_TS).matchAll(/--luci-[a-z0-9-]+(?=:)/g)) {
      defined.add(m[0]);
    }

    const missing: string[] = [];
    for (const css of [TOOLBAR_CSS, FEEDBACK_CSS]) {
      for (const m of css.matchAll(/var\((--luci-[a-z0-9-]+)\)/g)) {
        if (!defined.has(m[1]!)) missing.push(m[1]!);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('dark-mode danger has >= 4.5:1 contrast against all dark surfaces it sits on', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
    };

    // Dark-mode danger is nose-pink-300 (#F5B9B4)
    const dangerDark = '#F5B9B4';
    const darkSurfaces = {
      surface: '#2B2B2B', // muzzle-900
      'surface-raised': '#3B3A39', // muzzle-800
      'surface-sunken': '#3B3A39' // muzzle-800
    };

    for (const [name, surfaceHex] of Object.entries(darkSurfaces)) {
      const r = ratio(dangerDark, surfaceHex);
      expect(r, `danger on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
