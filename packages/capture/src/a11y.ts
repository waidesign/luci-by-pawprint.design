/**
 * Accessibility notes (v0.2): computed from the snapshot, so they are what the page shows.
 * Contrast uses WCAG 2.2's relative luminance on the text color and the color behind it (the
 * element's and its ancestors' backgrounds, layered, over a white canvas). A gradient, a picture
 * or opacity on the way makes the ratio an estimate. Pure.
 */
import { parse, rgb } from 'culori';
import type { Accessibility, ComponentCapture, WcagLevel } from '@luci-dev/format/capture';
import type { ElementSnapshot, PageSnapshot } from './model.js';

interface Rgba { r: number; g: number; b: number; a: number }

const toRgba = (text: string | undefined): Rgba | null => {
  if (!text) return null;
  try {
    const c = rgb(parse(text.trim()) as Parameters<typeof rgb>[0]);
    return c ? { r: c.r, g: c.g, b: c.b, a: c.alpha ?? 1 } : null;
  } catch {
    return null;
  }
};
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1
});
const css = (c: Rgba) => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;

/** WCAG relative luminance of an opaque color (channels 0 to 1). */
export function luminance(c: { r: number; g: number; b: number }): number {
  const ch = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** The contrast ratio of two opaque colors, rounded down to two decimals. */
export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** WCAG's large text: 24px, or 18.66px (14pt) and bold. */
export const isLargeText = (sizePx: number, weight: number) => sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);

/** The level a ratio meets: AA 4.5 and AAA 7 for normal text, 3 and 4.5 for large text. */
export function contrastLevel(ratio: number, large: boolean): WcagLevel {
  const [aa, aaa] = large ? [3, 4.5] : [4.5, 7];
  return ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'fail';
}

/** The ancestors of an element in the snapshot, nearest first (the element itself first). */
function lineage(snap: PageSnapshot, el: ElementSnapshot): ElementSnapshot[] {
  const out: ElementSnapshot[] = [];
  for (let e: ElementSnapshot | undefined = el; e && out.length < 200; e = e.parent === undefined ? undefined : snap.elements[e.parent]) out.push(e);
  return out;
}

/** The color behind an element's text: backgrounds layered from the first opaque one up, over white. */
export function backgroundBehind(snap: PageSnapshot, el: ElementSnapshot): { color: Rgba; estimated: boolean } {
  const layers: Rgba[] = [];
  let estimated = false;
  for (const e of lineage(snap, el)) {
    if (Number(e.styles.opacity ?? '1') < 1) estimated = true;
    const image = e.styles['background-image'];
    if (image && image !== 'none') estimated = true;
    const c = toRgba(e.styles['background-color']);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) break;
    }
  }
  let color: Rgba = { r: 1, g: 1, b: 1, a: 1 };
  for (const layer of layers.reverse()) color = over(layer, color);
  return { color, estimated };
}

/** One text's contrast against what is behind it, or null when its color cannot be read. */
export function contrastOf(snap: PageSnapshot, el: ElementSnapshot, part?: string): Accessibility['contrast'][number] | null {
  const text = toRgba(el.styles.color);
  if (!text) return null;
  const { color: bg, estimated } = backgroundBehind(snap, el);
  const fg = text.a < 1 ? over(text, bg) : text;
  const ratio = contrastRatio(fg, bg);
  const large = isLargeText(parseFloat(el.styles['font-size'] ?? '16') || 16, Number(el.styles['font-weight'] ?? '400') || 400);
  return {
    ...(part ? { part } : {}),
    text: css(fg),
    background: css(bg),
    ratio,
    large,
    level: contrastLevel(ratio, large),
    ...(estimated || text.a < 1 ? { estimated: true } : {})
  };
}

const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'textbox', 'searchbox', 'combobox', 'slider', 'spinbutton']);
const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);

/** Something you click or type in. */
export const isInteractive = (el: ElementSnapshot) => (el.role !== null && INTERACTIVE_ROLES.has(el.role)) || (INTERACTIVE_TAGS.has(el.tag) && (el.tag !== 'a' || el.role === 'link'));

/** The level a target size meets (WCAG 2.5.8 AA: 24 by 24px; 2.5.5 AAA: 44 by 44px). */
export function targetLevel(width: number, height: number): WcagLevel {
  return width >= 44 && height >= 44 ? 'AAA' : width >= 24 && height >= 24 ? 'AA' : 'fail';
}

/** Properties whose change makes focus visible. */
const FOCUS_SIGNS = /^(outline(?!-offset)|box-shadow|border|background|color$|text-decoration)/;

/**
 * Whether focus shows, from the states read: the focus-visible state, else focus. When the states
 * came from stylesheet rules only, the browser's own ring cannot be seen, so the answer is unknown.
 */
export function focusOf(states: ComponentCapture['states']): NonNullable<Accessibility['focus']> {
  for (const state of ['focus-visible', 'focus'] as const) {
    const s = states.find(x => x.state === state);
    if (!s || !s.detected) continue;
    const by = [...new Set(s.changes.map(c => c.property).filter(p => FOCUS_SIGNS.test(p)))];
    if (by.length) return { visible: true, state, by };
  }
  const read = states.filter(x => x.state === 'focus-visible' || x.state === 'focus');
  // Forced by the browser (or a real pointer) and nothing visible changed: focus does not show
  if (read.length && read.every(x => x.method === 'forced' || x.method === 'pointer' || x.method === 'manual')) return { visible: false, by: [] };
  return { visible: null, by: [] };
}

/**
 * A component's notes: contrast for each text part (the container's own text first), and for
 * something you click, its target size and whether focus shows.
 */
export function componentAccessibility(snap: PageSnapshot, container: ElementSnapshot, parts: readonly { part: string; el: ElementSnapshot }[], states: ComponentCapture['states']): Accessibility {
  const seen = new Set<number>();
  const contrast: Accessibility['contrast'] = [];
  for (const { part, el } of [{ part: 'container', el: container }, ...parts]) {
    if (seen.has(el.id) || !el.visible || !el.hasText) continue;
    seen.add(el.id);
    const c = contrastOf(snap, el, part);
    if (c) contrast.push(c);
  }
  if (!isInteractive(container)) return { contrast };
  const { width, height } = container.rect;
  return {
    contrast,
    target: { width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100, level: targetLevel(width, height) },
    focus: focusOf(states)
  };
}
