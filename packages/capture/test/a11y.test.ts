import { describe, expect, it } from 'vitest';
import { backgroundBehind, componentAccessibility, contrastLevel, contrastOf, contrastRatio, focusOf, isLargeText, targetLevel, type ElementSnapshot, type PageSnapshot } from '@luci-dev/capture';

const black = { r: 0, g: 0, b: 0 };
const white = { r: 1, g: 1, b: 1 };
const grey = (v: number) => ({ r: v / 255, g: v / 255, b: v / 255 });

let next = 0;
const el = (styles: ElementSnapshot['styles'], extra: Partial<ElementSnapshot> = {}): ElementSnapshot => ({
  id: next++, tag: 'div', role: null, selector: 'div', rect: { x: 0, y: 0, width: 100, height: 40 }, visible: true, hasText: true, inShadow: false, styles, authored: {}, ...extra
});
const snap = (elements: ElementSnapshot[]): PageSnapshot => ({ url: 'https://example.com/', rootFontSize: 16, customProperties: {}, elements });
/** A chain root > ... > leaf, each the parent of the next. */
const chain = (...styles: ElementSnapshot['styles'][]) => {
  next = 0;
  const els = styles.map((s, i) => el(s, i ? { parent: i - 1 } : {}));
  return { snapshot: snap(els), leaf: els[els.length - 1]! };
};

describe('accessibility notes (v0.2)', () => {
  it('contrast ratios match WCAG, rounded down', () => {
    expect(contrastRatio(black, white)).toBe(21);
    expect(contrastRatio(white, white)).toBe(1);
    // #767676 on white is the classic 4.54:1 (passes AA); #777777 is just under (4.47)
    expect(contrastRatio(grey(0x76), white)).toBe(4.54);
    expect(contrastRatio(grey(0x77), white)).toBe(4.47);
    expect(contrastLevel(4.54, false)).toBe('AA');
    expect(contrastLevel(4.47, false)).toBe('fail');
    expect(contrastLevel(4.47, true)).toBe('AA');
    expect(contrastLevel(7, false)).toBe('AAA');
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(19, 700)).toBe(true);
    expect(isLargeText(19, 400)).toBe(false);
  });

  it('the background behind text is layered from the ancestors over white', () => {
    // A half-transparent black over a white page is mid grey
    const { snapshot, leaf } = chain({ 'background-color': 'rgb(255, 255, 255)' }, { 'background-color': 'rgba(0, 0, 0, 0.5)' }, { 'background-color': 'rgba(0, 0, 0, 0)', color: 'rgb(255, 255, 255)' });
    const behind = backgroundBehind(snapshot, leaf);
    expect(Math.round(behind.color.r * 255)).toBe(128);
    expect(behind.estimated).toBe(false);
    const c = contrastOf(snapshot, leaf)!;
    expect(c.background).toBe('rgb(128, 128, 128)');
    expect(c.level).toBe('fail');
    // A gradient or a photo on the way makes it a guess
    const photo = chain({ 'background-color': 'rgb(0, 0, 0)', 'background-image': 'url("hero.jpg")' }, { color: 'rgb(255, 255, 255)' });
    expect(contrastOf(photo.snapshot, photo.leaf)!).toMatchObject({ ratio: 21, estimated: true });
    // No background anywhere: the white canvas
    const plain = chain({}, { color: 'rgb(22, 22, 22)' });
    expect(contrastOf(plain.snapshot, plain.leaf)!.background).toBe('rgb(255, 255, 255)');
  });

  it('target size: 24px for AA, 44px for AAA; only for things you click', () => {
    expect(targetLevel(44, 44)).toBe('AAA');
    expect(targetLevel(80, 30)).toBe('AA');
    expect(targetLevel(80, 20)).toBe('fail');
    next = 0;
    const button = el({ color: 'rgb(255, 255, 255)', 'background-color': 'rgb(15, 98, 254)' }, { tag: 'button', role: 'button', rect: { x: 0, y: 0, width: 120, height: 40 } });
    const card = el({ color: 'rgb(0, 0, 0)' });
    expect(componentAccessibility(snap([button]), button, [], []).target).toEqual({ width: 120, height: 40, level: 'AA' });
    expect(componentAccessibility(snap([card]), card, [], [])).toEqual({ contrast: [expect.objectContaining({ part: 'container', ratio: 21 })] });
  });

  it('focus shows when its focus state changes an outline, a shadow, a border or a color', () => {
    expect(focusOf([{ state: 'focus-visible', detected: true, method: 'forced', changes: [{ property: 'outline', from: 'none', to: { computed: 'rgb(15, 98, 254) solid 2px' } }, { property: 'outline-offset', from: '0px', to: { computed: '2px' } }] }]))
      .toEqual({ visible: true, state: 'focus-visible', by: ['outline'] });
    // The browser forced focus and nothing changed: it does not show
    expect(focusOf([{ state: 'focus', detected: false, method: 'forced', changes: [] }, { state: 'focus-visible', detected: false, method: 'forced', changes: [] }])).toEqual({ visible: false, by: [] });
    // Only the stylesheets were read: the browser's own ring cannot be seen there
    expect(focusOf([{ state: 'focus-visible', detected: false, method: 'rules', changes: [] }])).toEqual({ visible: null, by: [] });
    expect(focusOf([])).toEqual({ visible: null, by: [] });
  });
});
