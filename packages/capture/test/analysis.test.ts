import { describe, expect, it } from 'vitest';
import { formatCapture, parseCapture } from '@luci/format/capture';
import {
  boxShorthand,
  componentCapture,
  componentType,
  motionOf,
  colorSystem,
  colorToken,
  distanceBetween,
  distanceToken,
  elementName,
  eligibility,
  findBaseUnit,
  implicitRole,
  spacingSystem,
  spacingToken,
  spacingUses,
  textGroups,
  textToken,
  typographySystem,
  type ElementSnapshot,
  type PageSnapshot
} from '../src/index.js';

let next = 0;
const TEXT = { 'font-family': 'Inter, sans-serif', 'font-size': '16px', 'font-weight': '400', 'line-height': '24px', 'letter-spacing': 'normal', 'font-style': 'normal', 'text-transform': 'none', 'text-decoration-line': 'none', color: 'rgb(22, 22, 22)' };
function el(tag: string, styles: ElementSnapshot['styles'] = {}, extra: Partial<ElementSnapshot> = {}): ElementSnapshot {
  const id = next++;
  return {
    id, tag, role: implicitRole(tag), selector: `${tag}:nth-of-type(${id})`, rect: { x: 0, y: id * 40, width: 100, height: 30 },
    visible: true, hasText: false, inShadow: false, styles: { display: 'block', 'background-color': 'rgba(0, 0, 0, 0)', ...styles }, authored: {}, ...extra
  };
}
const text = (tag: string, styles: ElementSnapshot['styles'] = {}, extra: Partial<ElementSnapshot> = {}) => el(tag, { ...TEXT, ...styles }, { hasText: true, ...extra });
const page = (elements: ElementSnapshot[], customProperties: Record<string, string> = {}): PageSnapshot => ({ url: 'https://example.com/pricing?x=1', rootFontSize: 16, customProperties, elements });
const CAPTURED = { captured: '2026-11-12' };
const roundTrips = (capture: Parameters<typeof formatCapture>[0]) => expect(parseCapture(formatCapture(capture)).ok).toBe(true);

describe('eligibility (FR4)', () => {
  it('blocks images, video and canvas with a reason; allows SVG and components; the body redirects', () => {
    for (const tag of ['img', 'picture', 'video', 'canvas']) expect(eligibility({ tag }).status, tag).toBe('blocked');
    expect(eligibility({ tag: 'img' })).toMatchObject({ reason: 'Images cannot be captured.' });
    for (const tag of ['svg', 'button', 'my-card', 'section']) expect(eligibility({ tag }).status, tag).toBe('allowed');
    expect(eligibility({ tag: 'div', backgroundImage: 'url("hero.jpg")' }).status).toBe('blocked');
    expect(eligibility({ tag: 'div', backgroundImage: 'linear-gradient(red, blue)' }).status).toBe('allowed');
    expect(eligibility({ tag: 'BODY' }).status).toBe('redirected');
  });

  it('names elements from tag and role, never classes', () => {
    expect(elementName('h1', 'heading')).toBe('h1 (heading)');
    expect(elementName('button', 'button')).toBe('button');
    expect(elementName('div', null)).toBe('div');
    expect(implicitRole('input', { type: 'checkbox' })).toBe('checkbox');
    expect(implicitRole('a', { href: false })).toBeNull();
  });
});

describe('Text tool (FR11, FR12)', () => {
  const snapshot = () => page([
    text('h1', { 'font-size': '48px', 'font-weight': '700', 'line-height': '56px' }, { authored: { 'font-size': 'var(--text-4xl)' } }),
    text('h2', { 'font-size': '32px', 'font-weight': '600', 'line-height': '40px' }),
    text('h2', { 'font-size': '32px', 'font-weight': '600', 'line-height': '40px' }),
    text('p'), text('p'), text('li', { color: 'rgb(57, 57, 57)' }), text('p', { color: 'rgb(57, 57, 57)' }), text('p', { color: 'rgb(57, 57, 57)' }),
    text('p', { 'font-size': '20px', 'line-height': '28px' }),
    text('small', { 'font-size': '12px', 'line-height': '16px' }),
    text('button', { 'font-size': '14px', 'font-weight': '600', 'text-transform': 'uppercase' }),
    text('code', { 'font-family': '"JetBrains Mono", monospace', 'font-size': '14px' }),
    text('p', {}, { visible: false })
  ]);

  it('every distinct style appears once, as a named role with its use count', () => {
    const groups = textGroups(snapshot());
    expect(groups.map(g => [g.role, g.elements.length])).toEqual([
      ['heading-1', 1], ['heading-2', 2], ['body-large', 1], ['body', 5], ['code', 1], ['label', 1], ['caption', 1]
    ]);
    // Colour is not part of a style: the most used colour is shown
    expect(groups.find(g => g.role === 'body')?.style.color.computed).toBe('rgb(57, 57, 57)');
    expect(groups.find(g => g.role === 'body')?.tags).toEqual(['p', 'li']);
    expect(groups.find(g => g.role === 'label')?.style.transform?.computed).toBe('uppercase');
  });

  it('a large non-heading style is display; two styles with one name are numbered', () => {
    const roles = textGroups(page([text('p', { 'font-size': '64px' }), text('p'), text('p'), text('h2', { 'font-size': '30px' }), text('h2', { 'font-size': '28px' })])).map(g => g.role);
    expect(roles).toEqual(['display', 'heading-2', 'heading-2-2', 'body']);
  });

  it('typography system: families, scale with tokens, and a valid file', () => {
    const system = typographySystem(snapshot(), CAPTURED)!;
    expect(system.families).toEqual([{ family: 'Inter, sans-serif', count: 11 },{ family: '"JetBrains Mono", monospace', count: 1 }]);
    expect(system.scale[0]).toEqual({ size: { computed: '48px', token: '--text-4xl' }, count: 1 });
    expect(system.scale.map(s => s.size.computed)).toEqual(['48px', '32px', '20px', '16px', '14px', '12px']);
    roundTrips(system);
    expect(typographySystem(page([el('div')]))).toBeNull();
  });

  it('one text style is named after its role on the page', () => {
    const s = snapshot();
    const token = textToken(s, s.elements[1]!, CAPTURED);
    expect(token.meta.name).toBe('text-heading-2');
    expect(token.usedBy.element).toBe('h2 (heading)');
    expect(token.style.style).toBeUndefined();
    roundTrips(token);
  });
});

describe('Colour tool (FR13, FR14)', () => {
  const snapshot = () => page([
    el('body', { 'background-color': 'rgb(255, 255, 255)' }, { authored: { 'background-color': 'var(--color-bg)' } }),
    text('p'), text('p'),
    el('a', { ...TEXT, color: 'rgb(255, 255, 255)', 'background-color': 'rgb(15, 98, 254)' }, { hasText: true, authored: { 'background-color': 'var(--color-primary)' } }),
    el('div', { 'border-top-width': '1px', 'border-top-style': 'solid', 'border-top-color': 'rgb(224, 224, 224)', 'border-left-width': '0px', 'border-left-style': 'solid', 'border-left-color': 'rgb(255, 0, 0)' }),
    el('div', { 'background-color': 'rgb(244, 244, 244)' }, { visible: false })
  ], { '--color-bg': '#ffffff', '--color-primary': '#0f62fe', '--color-unused': 'rgb(1, 2, 3)', '--space-4': '16px' });

  it('every colour a visible element uses appears with a role; chromatic colours are accents', () => {
    const system = colorSystem(snapshot(), CAPTURED)!;
    expect(system.roles.map(r => [r.role, r.value.computed, r.count])).toEqual([
      ['background', 'rgb(255, 255, 255)', 1], ['text', 'rgb(22, 22, 22)', 2], ['text', 'rgb(255, 255, 255)', 1], ['border', 'rgb(224, 224, 224)', 1], ['accent', 'rgb(15, 98, 254)', 1]
    ]);
    expect(system.roles[0]?.value.token).toBe('--color-bg');
    // Hidden elements and borders without width are left out
    expect(system.roles.some(r => r.value.computed === 'rgb(244, 244, 244)' || r.value.computed === 'rgb(255, 0, 0)')).toBe(false);
    expect(system.tokens).toEqual([
      { token: '--color-bg', value: '#ffffff', count: 1 }, { token: '--color-primary', value: '#0f62fe', count: 1 }, { token: '--color-unused', value: 'rgb(1, 2, 3)', count: 0 }
    ]);
    roundTrips(system);
  });

  it('a picked element gives its main colour; a pixel resolves to a token, or is estimated', () => {
    const s = snapshot();
    const fromElement = colorToken(s, { element: s.elements[3]! }, CAPTURED)!;
    expect(fromElement).toMatchObject({ meta: { name: 'color-primary', method: 'measured' }, value: { token: '--color-primary' }, role: 'accent' });
    roundTrips(fromElement);
    const pixel = colorToken(s, { pixel: '#0F62FE' }, CAPTURED)!;
    expect(pixel.meta.method).toBe('measured');
    expect(pixel.value.token).toBe('--color-primary');
    const photo = colorToken(s, { pixel: 'rgb(201, 162, 39)' }, CAPTURED)!;
    expect(photo).toMatchObject({ meta: { name: 'color-c9a227', method: 'estimated' }, usedFor: [] });
    expect(photo.meta.selector).toBeUndefined();
    roundTrips(photo);
  });
});

describe('Component tool (FR7, FR10, FR17)', () => {
  it('shorthands, types and motion', () => {
    expect(boxShorthand('12px', '20px', '12px', '20px')).toBe('12px 20px');
    expect(boxShorthand('8px', '8px', '8px', '8px')).toBe('8px');
    expect(boxShorthand('1px', '2px', '3px', '2px')).toBe('1px 2px 3px');
    expect(componentType(el('a', { 'background-color': 'rgb(15, 98, 254)' }))).toBe('button');
    expect(componentType(el('a'))).toBe('link');
    expect(componentType(el('li', { 'box-shadow': '0 1px 2px black' }, { rect: { x: 0, y: 0, width: 300, height: 200 } }))).toBe('card');
    expect(motionOf(el('a', { 'transition-property': 'background-color, color', 'transition-duration': '150ms, 0s', 'transition-timing-function': 'ease-out', 'transition-delay': '0s' })))
      .toEqual([{ kind: 'transition', target: 'background-color', duration: '150ms', easing: 'ease-out' }]);
    expect(motionOf(el('a', { 'transition-property': 'all', 'transition-duration': '0s', 'animation-name': 'none' }))).toEqual([]);
  });

  it('keeps only declared styles, names parts from structure, and groups variants', () => {
    const button = (bg: string, extra: Partial<ElementSnapshot> = {}) => el('a', { ...TEXT, 'background-color': bg, 'padding-top': '12px', 'padding-right': '20px', 'padding-bottom': '12px', 'padding-left': '20px', 'margin-top': '24px', 'border-radius': '8px' },
      { hasText: true, declared: { 'background-color': true, 'padding-top': true, 'padding-right': true, 'padding-bottom': true, 'padding-left': true, 'border-radius': true }, authored: { 'background-color': 'var(--color-primary)' }, ...extra });
    const a = button('rgb(15, 98, 254)');
    const b = button('rgb(15, 98, 254)');
    const ghost = button('rgb(244, 244, 244)');
    const s = { ...page([a, b, ghost], { '--color-primary': '#0f62fe' }), stylesReadable: true };
    const c = componentCapture(s, a, e => (e.id === a.id ? 0 : null), { captured: '2026-11-12', system: true });
    expect(c.meta).toMatchObject({ name: 'primary-button', type: 'button' });
    expect(c.anatomy[0]!.styles.map(x => x.property)).toEqual(['padding', 'border-radius', 'background-color']);
    expect(c.anatomy[1]).toMatchObject({ part: 'label', element: 'text' });
    expect(c.tokens).toEqual([{ token: '--color-primary', value: '#0f62fe', usedFor: ['background-color'] }]);
    expect(c.variants?.map(v => [v.name, v.count])).toEqual([['primary-button', 2], ['primary-button-2', 1]]);
    expect(c.variants?.[1]?.differences.map(d => d.property)).toEqual(['background-color']);
    roundTrips(c);
  });
});

describe('Spacing tool (FR15, FR16)', () => {
  const pad = (px: number, extra: Partial<ElementSnapshot> = {}) => el('div', { 'padding-top': `${px}px`, 'padding-bottom': `${px}px` }, extra);

  it('reads padding, margin and gap; skips browser defaults and gaps on non-flex boxes', () => {
    const p = el('p', { 'margin-top': '16px', 'margin-bottom': '16px' }, { browserDefault: { 'margin-top': true, 'margin-bottom': true } });
    expect(spacingUses(p)).toEqual([]);
    expect(spacingUses(el('ul', { display: 'block', 'row-gap': '8px' }))).toEqual([]);
    const flex = el('ul', { display: 'flex', 'column-gap': '16px' }, { authored: { 'column-gap': 'var(--space-4)' } });
    const uses = spacingUses(flex);
    expect(uses).toMatchObject([{ property: 'column-gap', kind: 'gap', px: 16, token: '--space-4' }]);
    const token = spacingToken(page([flex]), uses[0]!, CAPTURED);
    expect(token).toMatchObject({ meta: { name: 'spacing-ul-column-gap' }, label: 'authored', value: { computed: '16px', token: '--space-4' } });
    roundTrips(token);
  });

  it('finds the base unit, the scale and the outliers', () => {
    const s = page([pad(4), pad(8), pad(8), pad(12), pad(16), pad(16), pad(24), pad(32), pad(10)]);
    const system = spacingSystem(s, CAPTURED)!;
    expect(system.scale.map(x => [x.value.computed, x.count])).toEqual([['4px', 2], ['8px', 4], ['10px', 2], ['12px', 2], ['16px', 4], ['24px', 2], ['32px', 2]]);
    expect(system.baseUnit).toEqual({ px: 4, share: 0.89 });
    expect(system.outliers.map(o => o.value.computed)).toEqual(['10px']);
    roundTrips(system);
    expect(findBaseUnit([{ px: 8, count: 5 }, { px: 16, count: 5 }, { px: 24, count: 3 }, { px: 32, count: 1 }])).toEqual({ px: 8, share: 1 });
    expect(findBaseUnit([{ px: 7, count: 2 }, { px: 13, count: 2 }, { px: 19, count: 2 }])).toBeNull();
    // A 4px scale whose 12px values break the 8s is still a 4px scale
    expect(findBaseUnit([{ px: 8, count: 6 }, { px: 12, count: 6 }, { px: 16, count: 14 }, { px: 24, count: 16 }, { px: 32, count: 8 }])?.px).toBe(4);
  });

  it('measures the distance between two picked elements', () => {
    expect(distanceBetween({ x: 0, y: 0, width: 100, height: 40 }, { x: 0, y: 64, width: 100, height: 20 })).toEqual({ px: 24, axis: 'vertical' });
    expect(distanceBetween({ x: 0, y: 0, width: 50, height: 40 }, { x: 62, y: 0, width: 50, height: 40 })).toEqual({ px: 12, axis: 'horizontal' });
    expect(distanceBetween({ x: 0, y: 0, width: 50, height: 50 }, { x: 10, y: 10, width: 10, height: 10 }).px).toBe(0);
    const a = text('h1', {}, { rect: { x: 0, y: 0, width: 100, height: 40 } });
    const b = text('p', {}, { rect: { x: 0, y: 64, width: 100, height: 20 } });
    const token = distanceToken(page([a, b]), a, b, CAPTURED);
    expect(token).toMatchObject({ meta: { name: 'spacing-h1-to-p' }, kind: 'distance', label: 'measured', value: { computed: '24px' } });
    roundTrips(token);
  });
});
