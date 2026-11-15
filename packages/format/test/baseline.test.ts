/**
 * The project design baseline (B14): typography, colors and spacing read from a project's own
 * stylesheets, in Luci's format.
 */
import { describe, expect, it } from 'vitest';
import { buildBaseline, formatCapture, parseCapture, parseStylesheet } from '../src/capture/index.js';

const OPTIONS = { project: 'shop', captured: '2026-11-15' };

const GLOBALS = `
/* Design tokens */
:root {
  --brand: #0f62fe;
  --ink: #161616;
  --surface: #ffffff;
  --border-subtle: #e0e0e0;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --font-sans: "Inter", system-ui, sans-serif;
}
.dark { --surface: #161616; --ink: #f4f4f4; }
html, body { font-family: var(--font-sans); color: var(--ink); background: var(--surface); line-height: 1.5; }
h1 { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.02em; }
h2 { font-size: 2rem; }
.card { padding: var(--space-4); border: 1px solid var(--border-subtle); gap: var(--space-2); margin: 0 auto; }
.button { background-color: var(--brand); color: var(--surface); padding: 0.5rem 1rem; }
@media (min-width: 768px) { .card { padding: 24px; } }
@keyframes spin { from { color: red; } to { color: blue; } }
`;

const SASS = `
$radius: 8px;
$accent: #ff6f00; // the brand's orange
.nav {
  padding: 12px 16px;
  a { color: $accent; margin-right: 8px; }
  &:hover { background: rgba(0, 0, 0, 0); }
}
`;

describe('reading stylesheets', () => {
  it('flattens nesting, passes @media through, skips @keyframes, and keeps Sass variables', () => {
    const { rules, vars } = parseStylesheet({ file: 'src/nav.scss', text: SASS });
    expect(vars.get('$accent')).toBe('#ff6f00');
    expect(rules.map(r => r.selector)).toEqual(['.nav a', '.nav:hover', '.nav']);
    const css = parseStylesheet({ file: 'src/app.css', text: GLOBALS });
    expect(css.rules.some(r => r.decls.some(d => d.value === 'red'))).toBe(false);
    expect(css.rules.filter(r => r.selector === '.card').length).toBe(2);
  });
});

describe('the baseline', () => {
  const b = buildBaseline([{ file: 'src/app.css', text: GLOBALS }, { file: 'src/nav.scss', text: SASS }], OPTIONS);

  it('lists the root tokens, resolved, and their first definition wins over a theme class', () => {
    expect(b.tokens.find(t => t.token === '--surface')).toMatchObject({ value: '#ffffff', resolved: '#ffffff', file: 'src/app.css' });
    expect(b.files).toEqual(['src/app.css', 'src/nav.scss']);
  });

  it('builds the color system from what properties use, with tokens and roles', () => {
    const c = b.color!;
    expect(c.meta).toMatchObject({ name: 'project-color', scope: 'system', type: 'color', method: 'authored', source: 'file:///shop' });
    const role = (r: string) => c.roles.filter(x => x.role === r).map(x => x.value);
    expect(role('background')).toContainEqual({ computed: 'rgb(15, 98, 254)', authored: 'var(--brand)', token: '--brand' });
    // Sass variables resolve (#ff6f00)
    expect(role('text')).toContainEqual({ computed: 'rgb(255, 111, 0)', authored: '$accent' });
    expect(role('border')).toContainEqual({ computed: 'rgb(224, 224, 224)', authored: 'var(--border-subtle)', token: '--border-subtle' });
    // A fully transparent color is not a color the project uses
    expect(c.roles.some(r => r.value.computed === 'transparent')).toBe(false);
    expect(c.tokens.find(t => t.token === '--brand')).toEqual({ token: '--brand', value: 'rgb(15, 98, 254)', count: 1 });
  });

  it('builds the spacing system in px at the root size, with its base unit', () => {
    const s = b.spacing!;
    expect(s.scale.map(x => x.value.computed)).toEqual(['8px', '12px', '16px', '24px']);
    expect(s.scale.find(x => x.value.computed === '16px')).toMatchObject({ count: 3 });
    expect(s.scale.find(x => x.value.token === '--space-4')).toBeTruthy();
    expect(s.baseUnit?.px).toBe(4);
  });

  it('builds the typography roles from element rules, the rest from body or the browser', () => {
    const t = b.typography!;
    const role = (r: string) => t.roles.find(x => x.role === r)!;
    expect(role('body').style.family).toEqual({ computed: '"Inter", system-ui, sans-serif', authored: 'var(--font-sans)', token: '--font-sans' });
    expect(role('heading-1').style).toMatchObject({ size: { computed: '40px', authored: '2.5rem' }, weight: { computed: '700' }, letterSpacing: { computed: '-0.32px' } });
    // h2 sets only its size: its weight is the browser's bold, its family the body's
    expect(role('heading-2').style.weight.computed).toBe('700');
    expect(role('heading-2').style.family.token).toBe('--font-sans');
    expect(t.families[0]).toEqual({ family: 'Inter', count: 1 });
    expect(t.scale.map(s => s.size.computed)).toEqual(['32px', '40px']);
  });

  it('writes files Luci reads back, marked authored', () => {
    for (const c of [b.typography!, b.color!, b.spacing!]) {
      const md = formatCapture(c);
      expect(md).toMatch(/^---\nname: project-\w+\nscope: system\n/);
      expect(md).toContain('method: authored');
      expect(parseCapture(md).ok).toBe(true);
    }
  });
});

describe('a utility framework\'s theme', () => {
  it('reads Tailwind v4 @theme tokens even when no stylesheet rule uses them', () => {
    const b = buildBaseline([{ file: 'app/globals.css', text: '@import "tailwindcss";\n@theme { --color-primary: oklch(0.6 0.2 250); --color-background: #fafafa; --spacing-4: 1rem; --text-lg: 1.125rem; --font-sans: Geist, sans-serif; }' }], OPTIONS);
    expect(b.tokens.map(t => t.token)).toContain('--color-primary');
    expect(b.color!.roles.map(r => [r.role, r.value.token])).toEqual(expect.arrayContaining([['background', '--color-background'], ['accent', '--color-primary']]));
    expect(b.spacing!.scale).toEqual([{ value: { computed: '16px', authored: 'var(--spacing-4)', token: '--spacing-4' }, count: 1 }]);
    expect(b.typography!.scale[0]!.size.token).toBe('--text-lg');
    expect(b.typography!.families[0]!.family).toBe('Geist');
  });

  it('gives nothing for a project without stylesheets', () => {
    expect(buildBaseline([], OPTIONS)).toMatchObject({ tokens: [], typography: null, color: null, spacing: null });
  });
});
