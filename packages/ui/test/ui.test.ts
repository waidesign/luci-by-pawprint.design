import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COPY, FACE_SVG, ICON_NAMES, Icon, IconColour, PALETTE, POSE_SVG, ROLES_BAR, ROLES_DARK, ROLES_LIGHT, faceSvg, mascotSvg, shortcutFor } from '@luci/ui';

const brand = (file: string) => readFileSync(fileURLToPath(new URL(`../../../brand/${file}`, import.meta.url)), 'utf8');

/** A role's colour as hex: its palette step, or the kit's literal value. */
function hexOf(value: string): string {
  const ref = /^var\(--luci-color-([a-z0-9-]+)\)$/.exec(value)?.[1];
  if (ref) return (PALETTE as Record<string, string>)[ref]!;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  throw new Error(`not an opaque colour: ${value}`);
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(hexOf(a)), lum(hexOf(b))];
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
};

describe('@luci/ui is generated from the brand kit', () => {
  it('has every palette colour of brand/luci-tokens.json, unchanged', () => {
    const kit = JSON.parse(brand('luci-tokens.json')) as { color: Record<string, Record<string, string>> };
    for (const [scale, steps] of Object.entries(kit.color)) {
      if (scale === 'roles') continue;
      for (const [step, hex] of Object.entries(steps)) expect((PALETTE as Record<string, string>)[`${scale}-${step}`]).toBe(hex);
    }
    // The kit's role list agrees with the generated light roles
    for (const [role, token] of [['surface', 'surface'], ['ink', 'ink'], ['textSecondary', 'ink-secondary'], ['primary', 'primary'], ['onPrimary', 'on-primary'], ['link', 'link'], ['accent', 'accent']] as const) {
      expect(hexOf(ROLES_LIGHT[token])).toBe(kit.color['roles']![role]);
    }
  });

  it('inlines the kit\'s layered art and animations unchanged (run `pnpm brand:sync` after the kit changes)', () => {
    expect(POSE_SVG.sit).toBe(brand('layered/luci-sit.svg').trim());
    expect(FACE_SVG.calm).toBe(brand('layered/luci-face-calm.svg').trim());
    expect(readFileSync(fileURLToPath(new URL('../src/mascot/luci-animations.css', import.meta.url)), 'utf8')).toBe(brand('luci-animations.css'));
  });
});

describe('contrast (WCAG AA, brand/DESIGN.md section 9)', () => {
  // Text on background pairs the components use: [what, text, background]
  const pairs = (r: Record<string, string>): [string, string, string][] => [
    ['ink on surface', r['ink']!, r['surface']!],
    ['ink on raised', r['ink']!, r['surface-raised']!],
    ['ink on sunken', r['ink']!, r['surface-sunken']!],
    ['secondary on surface', r['ink-secondary']!, r['surface']!],
    ['secondary on raised', r['ink-secondary']!, r['surface-raised']!],
    ['secondary on sunken', r['ink-secondary']!, r['surface-sunken']!],
    ['on-primary on primary', r['on-primary']!, r['primary']!],
    ['link on surface', r['link']!, r['surface']!],
    ['link on raised', r['link']!, r['surface-raised']!],
    ['on-accent on accent', r['on-accent']!, r['accent']!],
    ['warning', r['warning']!, r['warning-bg']!]
  ];
  // The kit's own pairs below 4.5:1, kept as the kit gives them until the brand owner decides
  const KIT_GAPS: Record<string, number> = {
    'on-primary on primary-hover': 4.13,
    'success': 4.49,
    'danger': 4.37,
    'danger on danger-hover': 3.9,
    'info': 4.48
  };
  const gaps = (r: Record<string, string>): [string, string, string][] => [
    ['on-primary on primary-hover', r['on-primary']!, r['primary-hover']!],
    ['success', r['success']!, r['success-bg']!],
    ['danger', r['danger']!, r['danger-bg']!],
    ['danger on danger-hover', r['danger']!, r['danger-hover']!],
    ['info', r['info']!, r['info-bg']!]
  ];

  for (const [theme, roles] of [['light', ROLES_LIGHT], ['dark', ROLES_DARK]] as const) {
    it(`every text pair passes 4.5:1 in the ${theme} theme`, () => {
      for (const [what, fg, bg] of pairs(roles)) expect(ratio(fg, bg), `${theme}: ${what}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('the dark toolbar pill passes 4.5:1', () => {
    expect(ratio(ROLES_BAR['bar-ink'], ROLES_BAR.bar)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ROLES_BAR['bar-ink-secondary'], ROLES_BAR.bar)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ROLES_BAR['on-tool-active'], ROLES_BAR['tool-active'])).toBeGreaterThanOrEqual(4.5);
  });
  it('the kit pairs under 4.5:1 are known and no worse', () => {
    for (const [what, fg, bg] of gaps(ROLES_LIGHT)) expect(ratio(fg, bg), what).toBeGreaterThanOrEqual(KIT_GAPS[what]!);
  });
});

describe('copy follows the voice rules (brand/BRAND.md section 2)', () => {
  const strings = (v: unknown): string[] => (typeof v === 'string' ? [v]
    : typeof v === 'function' ? [String((v as (...a: number[]) => string)(3, 6))]
    : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
  it('has no exclamation marks, emoji, "oops", "yay" or "buddy"', () => {
    const all = strings(COPY);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) {
      expect(s, s).not.toMatch(/!/);
      expect(s, s).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(s, s).not.toMatch(/\b(oops|oopsie|yay|buddy)\b/i);
    }
    expect(COPY.common.done(6, 6)).toBe('Done. 6 of 6 applied.');
  });
});

describe('icons (brand/DESIGN.md section 7)', () => {
  const pascal = (s: string) => s.split('-').map(p => p[0]!.toUpperCase() + p.slice(1)).join('');
  it('icons.ts exports exactly the approved icons of brand/luci-icons.json', async () => {
    const kit = JSON.parse(brand('luci-icons.json')) as { icons: Record<string, { lucide?: string }> };
    const ui = await import('@luci/ui') as Record<string, unknown>;
    const approved = Object.entries(kit.icons).filter(([, v]) => v.lucide);
    expect(Object.keys(ICON_NAMES).sort()).toEqual(approved.map(([n]) => n).sort());
    for (const [name] of approved) expect(typeof ui[`Icon${pascal(name)}`], name).toBe('function');
  });
  it('the Icon wrapper applies the kit style: 1.75 stroke, currentColor, hidden, 20 px by default', () => {
    const v = Icon({ icon: IconColour }) as unknown as { type: unknown; props: Record<string, unknown> };
    expect(v.type).toBe(IconColour);
    expect(v.props).toMatchObject({ size: 20, strokeWidth: 1.75, color: 'currentColor', 'aria-hidden': 'true' });
    expect((Icon({ icon: IconColour, size: 'toolbar' }) as unknown as { props: { size: number } }).props.size).toBe(22);
    expect((Icon({ icon: IconColour, size: 'compact' }) as unknown as { props: { size: number } }).props.size).toBe(16);
  });
  it('nothing imports lucide directly: only the generated icons.ts', () => {
    const root = fileURLToPath(new URL('../../../packages/', import.meta.url));
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', '.output', '.wxt', 'library', 'fixtures'].includes(e.name) || e.name.startsWith('.output')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !p.replace(/\\/g, '/').endsWith('packages/ui/src/icons.ts')
          && /from\s+['"]lucide-(preact|react)/.test(readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('shortcuts', () => {
  const key = (k: string, extra: Partial<KeyboardEvent> = {}, target: object = { tagName: 'BODY' }) =>
    ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, composedPath: () => [target], ...extra }) as unknown as KeyboardEvent;
  const list = [{ key: 'C', run: () => {} }, { key: 'T', run: () => {}, enabled: false }];
  it('a plain letter runs its shortcut, in either case', () => {
    expect(shortcutFor(key('c'), list)?.key).toBe('C');
    expect(shortcutFor(key('C'), list)?.key).toBe('C');
  });
  it('never while typing, with a modifier, on repeat, or when switched off', () => {
    expect(shortcutFor(key('c', {}, { tagName: 'INPUT' }), list)).toBeUndefined();
    expect(shortcutFor(key('c', {}, { tagName: 'TEXTAREA' }), list)).toBeUndefined();
    expect(shortcutFor(key('c', {}, { tagName: 'DIV', isContentEditable: true }), list)).toBeUndefined();
    for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat'] as const) expect(shortcutFor(key('c', { [m]: true }), list), m).toBeUndefined();
    expect(shortcutFor(key('t'), list)).toBeUndefined();
  });
});

describe('Mascot', () => {
  it('is decorative by default and labelled when meaningful', () => {
    expect(mascotSvg('peek')).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(mascotSvg('peek')).not.toMatch(/^<svg[^>]*role="img"/);
    expect(mascotSvg('peek', { label: 'Luci watching' })).toMatch(/^<svg[^>]*role="img" aria-label="Luci watching"/);
    // No fixed pixel size: the wrapper sets it
    expect(mascotSvg('sit')).not.toMatch(/^<svg[^>]*\swidth="/);
  });
  it('"hello" is the sitting pose with the greeting class; animated={false} holds him still', () => {
    expect(mascotSvg('hello')).toMatch(/^<svg[^>]*class="luci luci-pose-sit luci-hello"/);
    expect(mascotSvg('sit', { animated: false })).toMatch(/^<svg[^>]*class="luci luci-pose-sit luci-still"/);
  });
  it('gives each instance its own clip-path ids, so the same pose can appear twice', () => {
    const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const a = mascotSvg('head'), b = mascotSvg('head');
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).some(id => ids(b).includes(id))).toBe(false);
    // Every reference points at an id of the same instance
    for (const ref of [...a.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1])) expect(ids(a)).toContain(ref);
    expect(faceSvg('calm')).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
});
