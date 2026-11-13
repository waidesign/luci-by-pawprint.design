/**
 * The Component tool (FR7, FR9, FR10, FR17): one component's tokens, anatomy and motion, and, for
 * "The whole system", the similar elements on the page grouped as variants. States come from
 * states.ts. Works on the page snapshot only, so it is the same in both toolbar shells.
 */
import { colorKey, isTransparent, round, toCaptureName, type CapturedValue, type ComponentCapture } from '@luci/format/capture';
import { isChromatic } from './color.js';
import { tokenOf, valueOf, type ElementSnapshot, type PageSnapshot, type SnapshotProperty } from './model.js';
import { elementName } from './naming.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Box properties a container keeps when the site sets them (or, when sheets can't be read, when they differ from the initial value). */
const BOX: readonly SnapshotProperty[] = [
  'display', 'flex-direction', 'align-items', 'justify-content', 'row-gap', 'column-gap',
  'width', 'height', 'border-radius', 'background-color', 'background-image', 'box-shadow', 'opacity', 'cursor', 'outline-offset', 'text-align'
];
const TEXT: readonly SnapshotProperty[] = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-transform', 'text-decoration-line'];
/** Values that mean "nothing set" for a property. */
const NOTHING: Partial<Record<SnapshotProperty, RegExp>> = {
  'row-gap': /^(normal|0px)$/, 'column-gap': /^(normal|0px)$/, 'border-radius': /^0px$/, 'box-shadow': /^none$/,
  'background-image': /^none$/, opacity: /^1$/, cursor: /^auto$/, 'outline-offset': /^0px$/, 'text-align': /^(start|left)$/,
  'letter-spacing': /^normal$/, 'text-transform': /^none$/, 'text-decoration-line': /^none$/,
  'flex-direction': /^row$/, 'align-items': /^normal$/, 'justify-content': /^normal$/
};

const isNothing = (prop: SnapshotProperty, v: string) => (prop === 'background-color' ? isTransparent(v) : NOTHING[prop]?.test(v) ?? false);
/** A property counts as the element's own when the site set it (or, unreadable sheets, when it is not the initial value). */
const own = (snap: PageSnapshot, el: ElementSnapshot, prop: SnapshotProperty) => {
  const v = el.styles[prop] ?? '';
  if (!v || isNothing(prop, v)) return false;
  return snap.stylesReadable === false ? true : Boolean(el.declared?.[prop]);
};

/** "12px 20px" from four sides, as short as CSS allows. */
export function boxShorthand(top: string, right: string, bottom: string, left: string): string {
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}

const sides = ['top', 'right', 'bottom', 'left'] as const;

/**
 * A four-sided value with what the site wrote: one authored value (and its token) when every side
 * agrees, or the sides' authored values as a shorthand ("var(--space-3) var(--space-6)").
 */
function combined(el: ElementSnapshot, props: readonly SnapshotProperty[], computed: string): CapturedValue {
  const authored = props.map(p => el.authored[p]);
  if (!authored.every(Boolean)) return { computed };
  const text = boxShorthand(...(authored as [string, string, string, string]));
  const token = authored.every(a => a === authored[0]) ? tokenOf(authored[0]) : undefined;
  return { computed, ...(text !== computed ? { authored: text } : {}), ...(token ? { token } : {}) };
}

/** The container's own styles: layout, padding, border, radius, background, shadow... */
export function boxStyles(snap: PageSnapshot, el: ElementSnapshot): ComponentCapture['anatomy'][number]['styles'] {
  const out: ComponentCapture['anatomy'][number]['styles'] = [];
  const add = (property: string, value: CapturedValue) => out.push({ property, value });
  for (const p of BOX.slice(0, 6)) if (own(snap, el, p) || (p === 'display' && el.declared?.display)) add(p, valueOf(el, p));
  const pads = sides.map(s => `padding-${s}` as SnapshotProperty);
  if (pads.some(p => own(snap, el, p) && !el.browserDefault?.[p] && el.styles[p] !== '0px')) {
    add('padding', combined(el, pads, boxShorthand(...(pads.map(p => el.styles[p] ?? '0px') as [string, string, string, string]))));
  }
  const widths = sides.map(s => el.styles[`border-${s}-width`] ?? '0px');
  const styles = sides.map(s => el.styles[`border-${s}-style`] ?? 'none');
  const colors = sides.map(s => el.styles[`border-${s}-color`] ?? '');
  const visible = sides.filter((_, i) => parseFloat(widths[i]!) > 0 && styles[i] !== 'none');
  if (visible.length) {
    if (visible.length === 4 && new Set(widths).size === 1 && new Set(styles).size === 1 && new Set(colors.map(c => colorKey(c))).size === 1) {
      add('border', combined(el, sides.map(s => `border-${s}-color` as SnapshotProperty), `${widths[0]} ${styles[0]} ${colors[0]}`));
    } else {
      for (const s of visible) add(`border-${s}`, { computed: `${el.styles[`border-${s}-width`]} ${el.styles[`border-${s}-style`]} ${el.styles[`border-${s}-color`]}` });
    }
  }
  for (const p of BOX.slice(6)) if (own(snap, el, p)) add(p, p === 'background-image' && /url\(/.test(el.styles[p] ?? '') ? { computed: 'image (not captured)' } : valueOf(el, p));
  return out;
}

function textStyles(el: ElementSnapshot): ComponentCapture['anatomy'][number]['styles'] {
  return TEXT.filter(p => !isNothing(p, el.styles[p] ?? '')).map(p => ({ property: p, value: valueOf(el, p) }));
}

/** What kind of component an element is, from tag, role and how it looks. */
export function componentType(el: ElementSnapshot): string {
  const filled = !isTransparent(el.styles['background-color'] ?? 'transparent') || sides.some(s => parseFloat(el.styles[`border-${s}-width`] ?? '0') > 0);
  if (el.tag === 'button' || el.role === 'button') return 'button';
  if (el.tag === 'a') return filled ? 'button' : 'link';
  if (['input', 'select', 'textarea'].includes(el.tag)) return 'field';
  if (el.tag === 'nav') return 'navigation';
  if (['ul', 'ol'].includes(el.tag)) return 'list';
  if (['header', 'footer', 'form', 'dialog', 'table', 'figure'].includes(el.tag)) return el.tag;
  if (/^h[1-6]$/.test(el.tag)) return 'heading';
  const shadow = (el.styles['box-shadow'] ?? 'none') !== 'none';
  if (filled || shadow) return el.rect.height < 40 && el.hasText ? 'badge' : 'card';
  return toCaptureName(el.tag);
}

/** A part's name from tag and role. */
function partName(el: ElementSnapshot): string {
  if (/^h[1-6]$/.test(el.tag) || el.role === 'heading') return 'heading';
  if (['svg', 'i'].includes(el.tag) || el.role === 'img' && el.tag !== 'img') return 'icon';
  if (el.tag === 'img' || el.tag === 'picture') return 'image';
  if (['input', 'select', 'textarea'].includes(el.tag)) return 'field';
  if (el.tag === 'button' || el.role === 'button') return 'action';
  if (el.tag === 'a') return 'link';
  if (['ul', 'ol'].includes(el.tag)) return 'list';
  if (el.tag === 'li') return 'item';
  if (el.tag === 'p') return 'description';
  if (['code', 'pre', 'kbd'].includes(el.tag)) return 'code';
  return 'label';
}

/** Parts at most this deep, and at most this many. */
export const PART_DEPTH = 3;
export const MAX_PARTS = 10;

/**
 * The parts of a component: the container, then the elements inside it that carry text, an
 * icon, an image or a field. Each part's styles are its own (text style for text parts).
 */
/** The component's parts with the snapshot entry behind each: the container first (as "container"). */
export function componentParts(snap: PageSnapshot, container: ElementSnapshot, inside: (el: ElementSnapshot) => number | null): { part: string; el: ElementSnapshot }[] {
  const parts: { part: string; el: ElementSnapshot }[] = [{ part: 'container', el: container }];
  const used = new Map<string, number>();
  for (const el of snap.elements) {
    if (parts.length >= MAX_PARTS) break;
    const depth = inside(el);
    if (depth === null || depth < 1 || depth > PART_DEPTH || !el.visible) continue;
    const name = partName(el);
    const isIcon = name === 'icon' || name === 'image';
    if (!el.hasText && !isIcon && name !== 'field' && name !== 'action') continue;
    const n = (used.get(name) ?? (name === 'label' && container.hasText ? 1 : 0)) + 1;
    used.set(name, n);
    parts.push({ part: n > 1 ? `${name}-${n}` : name, el });
  }
  return parts;
}

export function anatomyOf(snap: PageSnapshot, container: ElementSnapshot, inside: (el: ElementSnapshot) => number | null): ComponentCapture['anatomy'] {
  const parts: ComponentCapture['anatomy'] = [{ part: 'container', element: elementName(container.tag, container.role), styles: boxStyles(snap, container) }];
  if (container.hasText) parts.push({ part: 'label', element: 'text', styles: textStyles(container) });
  for (const { part, el } of componentParts(snap, container, inside).slice(1)) {
    const name = part.replace(/-\d+$/, '');
    const isIcon = name === 'icon' || name === 'image';
    const styles = isIcon
      ? [{ property: 'width', value: { computed: `${round(el.rect.width)}px` } }, { property: 'height', value: { computed: `${round(el.rect.height)}px` } },
        ...(['fill', 'color'] as const).filter(p => el.styles[p] && el.styles[p] !== 'none' && el.tag !== 'img').slice(0, 1).map(p => ({ property: p, value: valueOf(el, p) }))]
      : [...textStyles(el), ...boxStyles(snap, el).filter(s => s.property !== 'display')];
    parts.push({ part, element: elementName(el.tag, el.role), styles });
  }
  return parts;
}

/** Custom properties the component's parts use, with resolved values and what they set. */
export function tokensOf(snap: PageSnapshot, anatomy: ComponentCapture['anatomy']): ComponentCapture['tokens'] {
  const uses = new Map<string, Set<string>>();
  for (const part of anatomy) for (const s of part.styles) {
    for (const m of (s.value.authored ?? '').matchAll(/var\(\s*(--[\w-]+)/g)) {
      uses.set(m[1]!, new Set([...(uses.get(m[1]!) ?? []), s.property]));
    }
  }
  return [...uses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([token, props]) => ({
    token,
    value: snap.customProperties[token] ?? '(set on an ancestor)',
    usedFor: [...props]
  }));
}

/** Transitions and animations (FR17). Nothing when every duration is zero. */
export function motionOf(el: ElementSnapshot): ComponentCapture['motion'] {
  const list = (v: string | undefined) => (v ?? '').split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean);
  const out: ComponentCapture['motion'] = [];
  const props = list(el.styles['transition-property']);
  const durations = list(el.styles['transition-duration']);
  const easings = list(el.styles['transition-timing-function']);
  const delays = list(el.styles['transition-delay']);
  props.forEach((target, i) => {
    const duration = durations[i % durations.length] ?? '0s';
    if (parseFloat(duration) === 0 || target === 'none') return;
    const delay = delays[i % delays.length];
    out.push({ kind: 'transition', target, duration, easing: easings[i % easings.length] ?? 'ease', ...(delay && parseFloat(delay) !== 0 ? { delay } : {}) });
  });
  const names = list(el.styles['animation-name']);
  const aDur = list(el.styles['animation-duration']);
  const aEase = list(el.styles['animation-timing-function']);
  names.forEach((target, i) => {
    if (target === 'none') return;
    out.push({ kind: 'animation', target, duration: aDur[i % aDur.length] ?? '0s', easing: aEase[i % aEase.length] ?? 'ease' });
  });
  return out;
}

/** The container properties variants are compared on. */
const VARIANT_PROPS: readonly SnapshotProperty[] = ['background-color', 'color', 'border-top-color', 'border-top-width', 'border-radius', 'padding-top', 'padding-left', 'font-size', 'font-weight', 'box-shadow', 'opacity'];
const signature = (el: ElementSnapshot) => VARIANT_PROPS.map(p => (/color$/.test(p) ? colorKey(el.styles[p] ?? '') : el.styles[p]) ?? '').join('|');

/** Similar elements on the page (same tag and type), grouped by how they look; the picked one's group first. */
export function variantsOf(snap: PageSnapshot, picked: ElementSnapshot, name: string): NonNullable<ComponentCapture['variants']> {
  const type = componentType(picked);
  const similar = snap.elements.filter(e => e.visible && e.tag === picked.tag && componentType(e) === type);
  const groups = new Map<string, ElementSnapshot[]>();
  for (const e of similar) groups.set(signature(e), [...(groups.get(signature(e)) ?? []), e]);
  const mine = signature(picked);
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === mine ? -1 : b[0] === mine ? 1 : b[1].length - a[1].length));
  return ordered.map(([, list], i) => {
    const example = list.includes(picked) ? picked : list[0]!;
    const differences = VARIANT_PROPS.filter(p => (/color$/.test(p) ? colorKey(example.styles[p] ?? '') !== colorKey(picked.styles[p] ?? '') : example.styles[p] !== picked.styles[p]))
      .map(p => ({ property: p, value: valueOf(example, p) }));
    return { name: i === 0 ? name : `${name}-${i + 1}`, count: list.length, selector: example.selector, differences };
  });
}

/** A component's name: its type, "primary-" when its background is an accent colour. */
export function componentName(el: ElementSnapshot): string {
  const type = componentType(el);
  const bg = el.styles['background-color'] ?? '';
  return toCaptureName(!isTransparent(bg) && isChromatic(bg) ? `primary-${type}` : type);
}

/**
 * One component (FR7): tokens, anatomy and motion; with `system`, the page's variants of it too.
 * `inside(el)` says how deep el is inside the container (0 for the container, null for outside).
 */
export function componentCapture(
  snap: PageSnapshot,
  el: ElementSnapshot,
  inside: (e: ElementSnapshot) => number | null,
  options: { captured?: string; system?: boolean; states?: ComponentCapture['states'] } = {}
): ComponentCapture {
  const name = componentName(el);
  const anatomy = anatomyOf(snap, el, inside);
  return {
    meta: { name, scope: 'component', type: componentType(el), source: snap.url, selector: el.selector, captured: options.captured ?? today(), method: 'measured' },
    tokens: tokensOf(snap, anatomy),
    anatomy,
    states: options.states ?? [],
    motion: motionOf(el),
    ...(options.system ? { variants: variantsOf(snap, el, name) } : {})
  };
}
