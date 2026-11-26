import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractTokens,
  formatCssVariables,
  formatTailwind,
  formatTailwindV3,
  CSS_VARS_FILE_NAME,
  TAILWIND_V4_FILE_NAME,
  TAILWIND_V3_FILE_NAME,
  type Capture,
  type ComponentCapture
} from '../src/capture/index.js';

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/capture/component-inputs.json', import.meta.url)), 'utf8')
) as Record<string, { capture: ComponentCapture }>;

const inputs = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/capture/inputs.json', import.meta.url)), 'utf8')
) as Record<string, { capture: Capture }>;

const button = fixtures['example-com.component.primary-button.design.md']!.capture;
const systems = ['example-com.system.color.design.md', 'example-com.system.typography.design.md', 'example-com.system.spacing.design.md'].map(
  f => inputs[f]!.capture
);

describe('Token extraction', () => {
  it('extracts colors, fonts, text styles, and spacing from systems and components', () => {
    const tokens = extractTokens([...systems, button]);
    expect(tokens.colors.size).toBeGreaterThan(0);
    expect(tokens.colors.has('primary')).toBe(true);
    expect(tokens.textStyles.size).toBeGreaterThan(0);
    expect(tokens.spacing.size).toBeGreaterThan(0);
  });
});

describe('CSS Variables export (:root)', () => {
  it('formats clean standard CSS with :root and custom properties', () => {
    const css = formatCssVariables([...systems, button], { name: 'Acme Design' });
    expect(css).toContain(':root {');
    expect(css).toContain('/* Colors */');
    expect(css).toMatch(/--color-primary: #[0-9a-f]{6};/i);
    expect(css).toContain('/* Typography */');
    expect(css).toContain('/* Spacing */');
    expect(css).toContain('}');
    expect(CSS_VARS_FILE_NAME).toBe('tokens.css');
  });
});

describe('Tailwind CSS v4 export (@theme)', () => {
  it('formats modern Tailwind v4 @theme block', () => {
    const theme = formatTailwind([...systems, button], { name: 'Acme Theme' });
    expect(theme).toContain('@theme {');
    expect(theme).toMatch(/--color-primary: #[0-9a-f]{6};/i);
    expect(theme).toMatch(/--spacing-/);
    expect(theme).toContain('}');
    expect(TAILWIND_V4_FILE_NAME).toBe('theme.css');
  });
});

describe('Tailwind CSS v3 export (tailwind.config.js)', () => {
  it('formats valid JS config extending theme', () => {
    const js = formatTailwindV3([...systems, button], { name: 'Acme Config' });
    expect(js).toContain('module.exports = {');
    expect(js).toContain('extend: {');
    expect(js).toContain('"colors": {');
    expect(js).toContain('"primary": "#');
    expect(js).toContain('"spacing": {');
    expect(TAILWIND_V3_FILE_NAME).toBe('tailwind.config.js');
  });
});

describe('Token names', () => {
  it("keep a token's own name once: --color-bg stays --color-bg, not --color-color-bg", () => {
    const all = [...systems, button];
    const css = formatCssVariables(all);
    const theme = formatTailwind(all);
    for (const out of [css, theme]) {
      expect(out).toContain('--color-bg: #ffffff;');
      expect(out).toContain('--color-text: #161616;');
      expect(out).toContain('--radius-md: 8px;');
      expect(out).not.toMatch(/--color-color-|--radius-radius-|--spacing-spacing-/);
    }
    const js = formatTailwindV3(all);
    expect(js).toContain('"bg": "#ffffff"');
    expect(js).toContain('"md": "8px"');
    expect(js).not.toContain('"color-bg"');
    expect(js).not.toContain('"radius-md"');
  });

  it('keeps a token named only by its group word (--color), and keeps two names apart', () => {
    const custom = {
      ...button,
      anatomy: [],
      tokens: [
        { token: '--color-primary', value: '#111111', usedFor: ['color'] },
        { token: '--color-brand', value: '#123456', usedFor: ['color'] },
        { token: '--color', value: '#abcdef', usedFor: ['color'] },
        { token: '--brand', value: '#fedcba', usedFor: ['color'] }
      ]
    } as unknown as ComponentCapture;
    const css = formatCssVariables([custom]);
    expect(css).toContain('--color-primary: #111111;');
    expect(css).toContain('--color-brand: #123456;');
    expect(css).toContain('--color-color: #abcdef;');
    expect(css).toContain('--color-brand-2: #fedcba;');
  });
});

/** Everything that makes a token file invalid CSS (or a broken Tailwind theme). */
function cssProblems(css: string): string[] {
  const problems: string[] = [];
  for (const m of css.matchAll(/(--[^\s:]+):\s*([^;]*);/g)) {
    const [, name, value] = m as unknown as [string, string, string];
    if (/[^\w-]/.test(name.slice(2))) problems.push(`name ${name}`);
    if (/\(set on|var\(/.test(value)) problems.push(`placeholder ${name}: ${value}`);
    if (/^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%/.test(value.trim())) problems.push(`bare channels ${name}: ${value}`);
    if (!value.trim()) problems.push(`empty ${name}`);
  }
  return problems;
}

describe('B-28: valid token files that follow the settings', () => {
  const messy = {
    ...button,
    tokens: [
      { token: '--tw-bg-opacity', value: '(set on an ancestor)', usedFor: ['background-color'] },
      { token: '--accent-3', value: '(set on an ancestor)', usedFor: ['color'] },
      { token: '--foreground', value: '20 14.3% 4.1%', usedFor: ['color'] },
      { token: '--shadow-ring', value: 'var(--tw-ring-shadow)', usedFor: ['box-shadow'] }
    ],
    anatomy: [{ ...button.anatomy[0]!, styles: [
      ...button.anatomy[0]!.styles,
      { property: 'border-radius', value: { computed: '9.2px' } }
    ] }]
  } as unknown as ComponentCapture;
  const spacing = { ...systems[2]!, scale: [{ value: { computed: '1.6px' }, count: 2 }, { value: { computed: '34.53px' }, count: 1 }] } as unknown as Capture;

  it('writes valid CSS: no placeholders, no bare channels, no dots in names', () => {
    for (const out of [formatCssVariables([messy, spacing]), formatTailwind([messy, spacing])]) {
      expect(cssProblems(out)).toEqual([]);
      expect(out).toContain('--color-foreground: #0c0a09;');
      expect(out).toMatch(/--spacing-1-6: 1\.6px;/);
      expect(out).toMatch(/--radius-[\w-]+: 9\.2px;/);
    }
  });

  it('follows units, colors and source', () => {
    const settings = { units: 'rem', colors: 'oklch', source: 'site', rootFontSize: 16 } as const;
    for (const out of [formatCssVariables([...systems, button], { settings }), formatTailwind([...systems, button], { settings }), formatTailwindV3([...systems, button], { settings })]) {
      expect(out).toMatch(/oklch\(/);
      expect(out).not.toMatch(/#[0-9a-f]{6}\b/i);
      expect(out).toMatch(/\d(\.\d+)?rem/);
      expect(out).not.toMatch(/: \d+(\.\d+)?px[;"]/);
      expect(out).toContain('Sources: example.com');
      expect(out.split('\n').find(l => l.includes('Sources:'))).not.toContain('https://');
    }
  });

  it('makes the accent --color-primary, never the first background; makes none up without an accent', () => {
    const color = systems[0] as unknown as { roles: { role: string; value: { computed: string } }[] };
    const accent = color.roles.find(r => r.role === 'accent')!;
    const backgroundFirst = { ...systems[0]!, roles: [...color.roles.filter(r => r.role !== 'accent'), accent] } as unknown as Capture;
    expect(extractTokens([backgroundFirst]).colors.get('primary')?.toLowerCase()).toBe(formatCssVariables([backgroundFirst]).match(/--color-primary: (#[0-9a-f]{6});/i)![1]!.toLowerCase());
    expect(extractTokens([backgroundFirst]).colors.get('primary')).toBe(extractTokens([{ ...systems[0]!, roles: [accent] } as unknown as Capture]).colors.get('primary'));
    const greysOnly = { ...systems[0]!, roles: color.roles.filter(r => r.role !== 'accent') } as unknown as Capture;
    expect(extractTokens([greysOnly]).colors.has('primary')).toBe(false);
  });

  it('exports a section, and Tailwind v3 has font sizes and lines up', () => {
    const section = fixtures['example-com.section.pricing.design.md']!.capture as unknown as Capture;
    for (const out of [formatCssVariables([section]), formatTailwind([section])]) {
      expect(out.split('\n').filter(l => /^\s+--/.test(l)).length).toBeGreaterThan(0);
      expect(cssProblems(out)).toEqual([]);
    }
    const js = formatTailwindV3([...systems, button]);
    expect(js).toContain('"fontSize": {');
    expect(js).toMatch(/\n {6}"colors": \{/);
    // It is a JavaScript module that loads
    const config = new Function('module', `${js}; return module.exports;`)({ exports: {} }) as { theme: { extend: Record<string, unknown> } };
    expect(Object.keys(config.theme.extend)).toEqual(expect.arrayContaining(['colors', 'fontSize', 'spacing']));
  });
});

describe('B-28 (privacy): page addresses in exports', () => {
  it('drop the query and fragment, and cannot end the comment they are written in', () => {
    const secret = { ...button, meta: { ...button.meta, source: 'https://app.example.com/reset?token=secret&email=a%40b.c#frag' } } as ComponentCapture;
    const sneaky = { ...button, meta: { ...button.meta, source: 'https://x.example.com/a*/body{display:none}/*' } } as ComponentCapture;
    for (const out of [formatCssVariables([secret, sneaky]), formatTailwind([secret, sneaky]), formatTailwindV3([secret, sneaky])]) {
      expect(out).toContain('https://app.example.com/reset');
      expect(out).not.toContain('secret');
      expect(out).not.toContain('token=');
      expect(out).not.toContain('#frag');
      // Every comment that opens closes on the same line, and nothing outside a comment comes from the address
      for (const line of out.split('\n').filter(l => l.includes('Sources:'))) expect(line).toMatch(/^\s*\/\* Sources: [^]*?\*\/\s*,?$/);
      expect(out).not.toMatch(/\*\/body\{display:none\}/);
    }
  });
});

describe('Export header', () => {
  it("links every export to Luci's own repository", () => {
    const header = '/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */';
    for (const out of [formatCssVariables([...systems, button]), formatTailwind([...systems, button]), formatTailwindV3([...systems, button])]) {
      expect(out.split('\n')[0]).toBe(header);
      expect(out).not.toContain('luci-ai');
    }
  });
});
