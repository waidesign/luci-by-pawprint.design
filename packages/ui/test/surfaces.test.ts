/**
 * The brand kit's checks for every Luci surface (brand/CLAUDE-CODE-GUIDE.md section 8): no colour
 * values outside the tokens, and no coloured or Charcoal strokes on components.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOOLBAR_CSS } from '@luci/capture';
import { FEEDBACK_CSS } from '@luci/feedback';

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

describe('strokes (brand/DESIGN.md section 4)', () => {
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
