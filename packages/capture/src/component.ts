/**
 * The Component tool (FR7, FR9, FR10, FR17): one component's tokens, anatomy and motion, and, for
 * "The whole system", the similar elements on the page grouped as variants. States come from
 * states.ts. Works on the page snapshot only, so it is the same in both toolbar shells.
 */
import { buildLayoutTree, channelColor, colorFunctionToken, colorKey, isFrameworkPlumbing, isTransparent, round, toCaptureName, withoutUrls, type CapturedValue, type ComponentCapture, type ComponentImage, type SiteStack } from '@luci-dev/format/capture';
import { componentAccessibility } from './a11y.js';
import { isChromatic } from './color.js';
import { imageSlot, type ImageReading } from './image.js';
import { computeElementLayout } from './layout.js';
import { tokenOf, valueOf, type ElementSnapshot, type PageSnapshot, type SnapshotProperty } from './model.js';
import { elementName } from './naming.js';
import { identifyIcon } from './icon.js';
import { detectSiteStack } from './stack.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Box properties a container keeps when the site sets them (or, when sheets can't be read, when they differ from the initial value). */
const BOX: readonly SnapshotProperty[] = [
  'display', 'flex-direction', 'align-items', 'justify-content', 'row-gap', 'column-gap',
  'width', 'height', 'border-radius', 'background-color', 'background-image', 'box-shadow', 'opacity', 'cursor', 'outline-offset', 'text-align', 'transform'
];
const TEXT: readonly SnapshotProperty[] = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'placeholder-color', 'text-transform', 'text-decoration-line'];
/** Values that mean "nothing set" for a property. */
const NOTHING: Partial<Record<SnapshotProperty, RegExp>> = {
  'row-gap': /^(normal|0px)$/, 'column-gap': /^(normal|0px)$/, 'border-radius': /^0px$/, 'box-shadow': /^none$/,
  'background-image': /^none$/, opacity: /^1$/, cursor: /^auto$/, 'outline-offset': /^0px$/, 'text-align': /^(start|left)$/,
  'letter-spacing': /^normal$/, 'text-transform': /^none$/, 'text-decoration-line': /^none$/,
  'flex-direction': /^row$/, 'align-items': /^normal$/, 'justify-content': /^normal$/, transform: /^none$/,
  'grid-template-columns': /^none$/, 'flex-wrap': /^nowrap$/, 'max-width': /^none$/
};

const isNothing = (prop: SnapshotProperty, v: string) => (!v || (prop === 'background-color' || prop === 'placeholder-color' ? isTransparent(v) : NOTHING[prop]?.test(v) ?? false));
/** A property counts as the element's own when the site set it (or, unreadable sheets, when it is not the initial value). */
const own = (snap: PageSnapshot, el: ElementSnapshot, prop: SnapshotProperty) => {
  const v = el.styles[prop] ?? '';
  if (!v || isNothing(prop, v)) return false;
  // A size is always "set" when measured: only a rule that sets it counts, readable sheets or not.
  // Otherwise one unreadable sheet (a font service's) gives every element its width in px (B-13).
  if (SIZES.has(prop)) return Boolean(el.declared?.[prop]);
  return snap.stylesReadable === false ? true : Boolean(el.declared?.[prop]);
};
const SIZES: ReadonlySet<SnapshotProperty> = new Set(['width', 'height']);
/** Sizes that follow the layout ("100%", "auto", "fit-content"): shown as written, never as this window's px (B-13). */
const FLUID_SIZE = /^(\d*\.?\d+%|auto|fit-content|min-content|max-content|stretch|-webkit-fill-available|\d*\.?\d+(vw|vh|dvw|dvh|svw|svh|lvw|lvh))$/i;
const sizeValue = (el: ElementSnapshot, prop: SnapshotProperty): CapturedValue => {
  const v = valueOf(el, prop);
  if (v.authored && FLUID_SIZE.test(v.authored.trim())) return { computed: v.authored.trim() };
  if (!v.computed && el.rect && (prop === 'width' || prop === 'height')) {
    return { computed: `${round(el.rect[prop])}px` };
  }
  return v;
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
  // A background photo's address is never kept (FR21); its slot is described under Images
  for (const p of BOX.slice(6)) if (own(snap, el, p)) add(p, p === 'background-image' ? noUrls(valueOf(el, p)) : SIZES.has(p) ? sizeValue(el, p) : valueOf(el, p));
  return out;
}

/** A layout box in a section (v0.2): its box styles, plus its grid columns, wrapping and max width when the site sets them. */
export function layoutStyles(snap: PageSnapshot, el: ElementSnapshot): ComponentCapture['anatomy'][number]['styles'] {
  const out = boxStyles(snap, el);
  const extra: SnapshotProperty[] = ['grid-template-columns', 'flex-wrap', 'max-width'];
  // After display and the flex settings (boxStyles writes those first), before padding and the rest
  const first = new Set<string>(BOX.slice(0, 6));
  const at = out.filter(s => first.has(s.property)).length;
  out.splice(at, 0, ...extra.filter(p => own(snap, el, p)).map(p => ({ property: p, value: valueOf(el, p) })));
  return out;
}

/** The text styles of an element (font, size, weight, line height, letter spacing, color...). */
export const textStylesOf = (el: ElementSnapshot) => textStyles(el);

const noUrls = (v: CapturedValue): CapturedValue => ({ ...v, computed: withoutUrls(v.computed), ...(v.authored ? { authored: withoutUrls(v.authored) } : {}) });

function textStyles(el: ElementSnapshot): ComponentCapture['anatomy'][number]['styles'] {
  return TEXT.filter(p => !isNothing(p, el.styles[p] ?? '')).map(p => ({ property: p, value: valueOf(el, p) }));
}

/** Parts of a table, a paragraph or the page itself: styled or not, never a card or a badge on their own (B-07). */
const NEVER_A_BOX = new Set(['tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup', 'col', 'p', 'dd', 'dt', 'main', 'body', 'html']);
/** Inline elements: a badge when filled, never a card. */
const INLINE_BOX = new Set(['span', 'strong', 'em', 'b', 'i', 'small', 'mark', 'abbr', 'label']);
/** A card is at least this big... */
export const CARD_MIN_WIDTH = 80;
export const CARD_MIN_HEIGHT = 48;
/**
 * ...and narrower than this share of the page: an edge-to-edge band with a background is a section.
 * Not lower: on a phone a card in one column, inside the page's own padding, is about 90% wide.
 */
export const CARD_MAX_WIDTH_SHARE = 0.98;

/** The page's width (the root element's), for telling a card from a full-width band. */
export function pageWidthOf(snap: PageSnapshot): number | undefined {
  const root = snap.elements.find(e => e.tag === 'html') ?? snap.elements.find(e => e.tag === 'body');
  return root && root.rect.width > 0 ? root.rect.width : undefined;
}

/**
 * What kind of component an element is, from tag, role and how it looks. A card is a bounded box
 * (B-07): not a table part, paragraph or inline element, not tiny (a 16 px star), and not a
 * full-width band when the page's width is known.
 */
export function componentType(el: ElementSnapshot, pageWidth?: number): string {
  const hasBg = !isTransparent(el.styles['background-color'] ?? 'transparent');
  const hasEnclosingBorders = (parseFloat(el.styles['border-top-width'] ?? '0') > 0 || parseFloat(el.styles['border-bottom-width'] ?? '0') > 0)
    && (parseFloat(el.styles['border-left-width'] ?? '0') > 0 || parseFloat(el.styles['border-right-width'] ?? '0') > 0);
  const anyBorder = sides.some(s => parseFloat(el.styles[`border-${s}-width`] ?? '0') > 0);
  const filled = hasBg || anyBorder;
  if (el.tag === 'button' || el.role === 'button') return 'button';
  if (el.tag === 'a') return (filled && el.rect.height <= 64 && el.rect.width < 320) ? 'button' : 'link';
  if (['input', 'select', 'textarea'].includes(el.tag)) return 'field';
  if (el.tag === 'nav') return 'navigation';
  if (['ul', 'ol'].includes(el.tag)) return 'list';
  if (['header', 'footer', 'form', 'dialog', 'table', 'figure'].includes(el.tag)) return el.tag;
  if (/^h[1-6]$/.test(el.tag)) return 'heading';
  if (NEVER_A_BOX.has(el.tag)) return toCaptureName(el.tag);
  const shadow = (el.styles['box-shadow'] ?? 'none') !== 'none';
  if (hasBg || shadow || hasEnclosingBorders) {
    if (el.rect.height < 40 && el.hasText) return 'badge';
    if (INLINE_BOX.has(el.tag)) return toCaptureName(el.tag);
    const bounded = el.rect.width >= CARD_MIN_WIDTH && el.rect.height >= CARD_MIN_HEIGHT
      && (pageWidth === undefined || el.rect.width < pageWidth * CARD_MAX_WIDTH_SHARE);
    if (bounded) return 'card';
  }
  return toCaptureName(el.tag);
}

/** A part's name from tag and role. */
export function partName(el: ElementSnapshot): string {
  if (/^h[1-6]$/.test(el.tag) || el.role === 'heading') return 'heading';
  if (['svg', 'i'].includes(el.tag) || el.role === 'img' && el.tag !== 'img') return 'icon';
  // "image" is an SVG <image>: a picture placed inside a drawing
  if (el.tag === 'img' || el.tag === 'picture' || el.tag === 'image') return 'image';
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
export const MAX_PARTS = 25;

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
    const name = partName(el);
    const isControl = name === 'field' || name === 'action' || name === 'link';
    const maxDepth = isControl ? 6 : PART_DEPTH;
    if (depth === null || depth < 1 || depth > maxDepth || !el.visible) continue;
    const isIcon = name === 'icon' || name === 'image';
    if (!el.hasText && !isIcon && name !== 'field' && name !== 'action') continue;
    const n = (used.get(name) ?? (name === 'label' && container.hasText ? 1 : 0)) + 1;
    used.set(name, n);
    parts.push({ part: n > 1 ? `${name}-${n}` : name, el });
  }
  return parts;
}

/** States are read on every element inside the component down to this depth, at most this many in all. */
export const STATE_DEPTH = 6;
export const MAX_STATE_TARGETS = 60;
/** Inside an SVG drawing only the drawing itself is watched, not each shape. */
const SVG_INNER = /^(path|circle|rect|ellipse|line|polyline|polygon|g|defs|use|symbol|clippath|mask|lineargradient|radialgradient|stop|tspan|text)$/;

/**
 * The elements a component's states are read on: its parts (componentParts), then every other element
 * inside it, hidden ones too (an arrow that fades in on hover, a shadow layer, an underline bar). The
 * others are named "decoration", or image/icon/label when that is what they are.
 */
export function stateParts(snap: PageSnapshot, container: ElementSnapshot, inside: (el: ElementSnapshot) => number | null): { part: string; el: ElementSnapshot }[] {
  const parts = componentParts(snap, container, inside);
  const taken = new Set(parts.map(p => p.el.id));
  const used = new Map<string, number>();
  for (const p of parts) {
    const base = p.part.replace(/-\d+$/, '');
    const n = Number(/-(\d+)$/.exec(p.part)?.[1] ?? 1);
    used.set(base, Math.max(used.get(base) ?? 0, n));
  }
  if (container.hasText) used.set('label', Math.max(used.get('label') ?? 0, 1));
  for (const el of snap.elements) {
    if (parts.length >= MAX_STATE_TARGETS) break;
    if (taken.has(el.id)) continue;
    const depth = inside(el);
    if (depth === null || depth < 1 || depth > STATE_DEPTH || SVG_INNER.test(el.tag)) continue;
    const kind = partName(el);
    // A field or a control deep inside wrappers is still a field or an action, never a decoration (B-10)
    const name = ['icon', 'image', 'field', 'action'].includes(kind) || el.hasText ? kind : 'decoration';
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    parts.push({ part: n > 1 ? `${name}-${n}` : name, el });
  }
  return parts;
}

export function anatomyOf(
  snap: PageSnapshot,
  container: ElementSnapshot,
  inside: (el: ElementSnapshot) => number | null,
  /** layout: also read grid columns, wrapping and max width (responsive readings compare them by width, B-17). */
  options: { nodes?: Element[]; layout?: boolean } = {}
): ComponentCapture['anatomy'] {
  const box = options.layout ? layoutStyles : boxStyles;
  const containerLayout = computeElementLayout(container);
  const isInput = container.tag === 'input' || container.tag === 'textarea' || container.role === 'textbox';
  const parts: ComponentCapture['anatomy'] = [{
    part: 'container',
    element: elementName(container.tag, container.role),
    depth: 0,
    ...(containerLayout ? { layout: containerLayout } : {}),
    styles: isInput ? [...textStyles(container), ...box(snap, container)] : box(snap, container)
  }];
  if (container.hasText) {
    const labelLayout = computeElementLayout(container, container);
    parts.push({
      part: 'label',
      element: 'text',
      parent: 'container',
      depth: 1,
      ...(labelLayout ? { layout: labelLayout } : {}),
      styles: textStyles(container)
    });
  }

  const elToPart = new Map<number, string>();
  elToPart.set(container.id, 'container');
  const partToEl = new Map<string, ElementSnapshot>();
  partToEl.set('container', container);

  const distinctCounts = new Map<string, number>();
  if (container.hasText) distinctCounts.set('label', 1);

  const rawParts = componentParts(snap, container, inside).slice(1);

  for (const { part: uncollapsedPart, el } of rawParts) {
    const baseName = uncollapsedPart.replace(/-\d+$/, '');
    const isIcon = baseName === 'icon' || baseName === 'image';
    const styles = isIcon
      ? [{ property: 'width', value: sizeValue(el, 'width') }, { property: 'height', value: sizeValue(el, 'height') },
        ...(['fill', 'color'] as const).filter(p => el.styles[p] && el.styles[p] !== 'none' && el.tag !== 'img' && el.tag !== 'image').slice(0, 1).map(p => ({ property: p, value: valueOf(el, p) }))]
      : [...textStyles(el), ...box(snap, el).filter(s => s.property !== 'display')];

    let parent = 'container';
    for (let cur = el.parent; cur !== undefined && cur !== container.id; cur = snap.elements[cur]?.parent) {
      const match = elToPart.get(cur);
      if (match) { parent = match; break; }
    }
    const parentEl = partToEl.get(parent) ?? container;
    const layout = computeElementLayout(el, parentEl);
    const depth = (parts.find(p => p.part === parent)?.depth ?? 0) + 1;
    const icon = (isIcon || el.tag === 'svg') && options.nodes?.[el.id] ? identifyIcon(options.nodes[el.id]!) ?? undefined : undefined;

    // Collapse only siblings with identical styles (B-09, Option A)
    const elName = elementName(el.tag, el.role);
    const styleKey = styles.map(s => `${s.property}:${s.value.computed}|${s.value.authored ?? ''}`).join(';');
    const duplicateSibling = parts.find(p => p.parent === parent && p.element === elName && p.part.replace(/-\d+$/, '') === baseName && p.styles.map(s => `${s.property}:${s.value.computed}|${s.value.authored ?? ''}`).join(';') === styleKey);
    if (duplicateSibling) {
      duplicateSibling.count = (duplicateSibling.count ?? 1) + 1;
      elToPart.set(el.id, duplicateSibling.part);
      continue;
    }

    const count = (distinctCounts.get(baseName) ?? 0) + 1;
    distinctCounts.set(baseName, count);
    const part = count > 1 ? `${baseName}-${count}` : baseName;

    elToPart.set(el.id, part);
    partToEl.set(part, el);

    const partObj: ComponentCapture['anatomy'][number] = {
      part,
      element: elName,
      parent,
      depth,
      ...(layout ? { layout } : {}),
      ...(icon ? { icon } : {}),
      styles
    };
    Object.defineProperty(partObj, '_el', { value: el, enumerable: false });
    parts.push(partObj);
  }
  return parts;
}

/** Custom properties the component's parts (and its images) use, with resolved values and what they set. */
export function tokensOf(snap: PageSnapshot, anatomy: readonly { styles: readonly { property: string; value: CapturedValue }[] }[]): ComponentCapture['tokens'] {
  const uses = new Map<string, Set<string>>();
  const wrappers = new Map<string, string>();
  const fallbacks = new Map<string, string>();
  for (const part of anatomy) for (const s of part.styles) {
    const authored = s.value.authored ?? '';
    for (const m of authored.matchAll(/var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\)/g)) {
      // Tailwind's --tw-* variables are plumbing, not the component's tokens (B-04)
      if (isFrameworkPlumbing(m[1]!)) continue;
      uses.set(m[1]!, new Set([...(uses.get(m[1]!) ?? []), s.property]));
      if (m[2] && !fallbacks.has(m[1]!)) fallbacks.set(m[1]!, m[2].trim());
    }
    const wrapped = colorFunctionToken(authored);
    if (wrapped) wrappers.set(wrapped.token, wrapped.fn);
  }
  return [...uses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([token, props]) => {
    const raw = snap.customProperties[token];
    // Bare channels ("20 14.3% 4.1%") read as the color the page makes of them (B-02)
    const fallback = fallbacks.get(token);
    const value = raw === undefined
      ? (fallback !== undefined ? `not set; falls back to ${fallback}` : '(set on an ancestor)')
      : channelColor(raw, wrappers.get(token)) ?? raw;
    return { token, value, usedFor: [...props] };
  });
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
const signature = (el: ElementSnapshot) => VARIANT_PROPS.map(p => {
  if (p === 'border-top-color' && parseFloat(el.styles['border-top-width'] ?? '0') === 0) return '';
  return (/color$/.test(p) ? colorKey(el.styles[p] ?? '') : el.styles[p]) ?? '';
}).join('|');

/**
 * Similar elements on the page (same tag and type), grouped by how they look, the picked one's group
 * first, each with its variant name. `within` limits them to part of the page (a section).
 */
export function variantGroups(snap: PageSnapshot, picked: ElementSnapshot, name: string, within?: (el: ElementSnapshot) => boolean): { name: string; elements: ElementSnapshot[] }[] {
  const width = pageWidthOf(snap);
  const type = componentType(picked, width);
  const isRealButton = type === 'button' && (picked.tag === 'button' || picked.role === 'button');
  const similar = snap.elements.filter(e => {
    if (!e.visible || (within && !within(e))) return false;
    if (componentType(e, width) !== type) return false;
    if (isRealButton) return e.tag === 'button' || e.role === 'button';
    return e.tag === picked.tag;
  });
  const groups = new Map<string, ElementSnapshot[]>();
  for (const e of similar) groups.set(signature(e), [...(groups.get(signature(e)) ?? []), e]);
  const mine = signature(picked);
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === mine ? -1 : b[0] === mine ? 1 : b[1].length - a[1].length));
  return ordered.map(([, elements], i) => ({ name: i === 0 ? name : `${name}-${i + 1}`, elements }));
}

/** Similar elements on the page (or within part of it), grouped by how they look; the picked one's group first. */
export function variantsOf(snap: PageSnapshot, picked: ElementSnapshot, name: string, within?: (el: ElementSnapshot) => boolean): NonNullable<ComponentCapture['variants']> {
  return variantGroups(snap, picked, name, within).map(({ name: variant, elements }) => {
    const example = elements.includes(picked) ? picked : elements[0]!;
    const differences = VARIANT_PROPS.filter(p => {
      if (p === 'border-top-color') {
        const exampleW = parseFloat(example.styles['border-top-width'] ?? '0');
        if (exampleW === 0) return false;
        const pickedW = parseFloat(picked.styles['border-top-width'] ?? '0');
        if (pickedW === 0) return false;
      }
      return /color$/.test(p) ? colorKey(example.styles[p] ?? '') !== colorKey(picked.styles[p] ?? '') : example.styles[p] !== picked.styles[p];
    }).map(p => ({ property: p, value: valueOf(example, p) }));
    return { name: variant, count: elements.length, selector: example.selector, differences };
  });
}

/** A component's name: its type, "primary-" when its background is an accent color. */
export function componentName(el: ElementSnapshot, pageWidth?: number): string {
  const type = componentType(el, pageWidth);
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
  options: { captured?: string; system?: boolean; states?: ComponentCapture['states']; images?: readonly ComponentImageInput[]; within?: (el: ElementSnapshot) => boolean; nodes?: Element[]; stack?: SiteStack } = {}
): ComponentCapture {
  const width = pageWidthOf(snap);
  const name = componentName(el, width);
  const anatomy = anatomyOf(snap, el, inside, options);
  const watched = stateParts(snap, el, inside);
  // Elements outside the anatomy that change in a state are named again, numbered from the anatomy's
  // own (the reader counted hidden elements that never change: "decoration-5" becomes "decoration")
  const changed = new Set((options.states ?? []).flatMap(s => s.changes.map(c => c.part ?? 'container')));
  const counters = new Map<string, number>();
  for (const a of anatomy) {
    const base = a.part.replace(/-\d+$/, '');
    counters.set(base, Math.max(counters.get(base) ?? 0, Number(/-(\d+)$/.exec(a.part)?.[1] ?? 1)));
  }
  const rename = new Map<string, string>();
  for (const p of watched) {
    if (!changed.has(p.part) || anatomy.some(a => a.part === p.part)) continue;
    const base = p.part.replace(/-\d+$/, '');
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    rename.set(p.part, n > 1 ? `${base}-${n}` : base);
  }
  const renamed = (part: string) => rename.get(part) ?? part;
  const states = (options.states ?? []).map(s => ({ ...s, changes: s.changes.map(c => (c.part ? { ...c, part: renamed(c.part) } : c)) }));
  // Parts that change in a state: their element, so the anatomy names them and their motion is kept
  const all = new Map(watched.map(p => [renamed(p.part), p.el]));
  const changing = new Set(states.flatMap(s => s.changes.map(c => c.part ?? 'container')));
  for (const part of changing) {
    const partEl = all.get(part);
    if (!partEl || anatomy.some(a => a.part === part)) continue;
    const kind = part.replace(/-\d+$/, '');
    const styles = kind === 'icon' || kind === 'image'
      ? [{ property: 'width', value: sizeValue(partEl, 'width') }, { property: 'height', value: sizeValue(partEl, 'height') }, ...boxStyles(snap, partEl).filter(s => !['display', 'width', 'height'].includes(s.property))]
      : [...(partEl.hasText ? textStyles(partEl) : []), ...boxStyles(snap, partEl).filter(s => s.property !== 'display')];
    anatomy.push({ part, element: elementName(partEl.tag, partEl.role), styles });
  }
  // Hidden at rest and changed in a state: it appears then (an arrow fading in on hover)
  for (const a of anatomy) {
    const partEl = all.get(a.part);
    if (!partEl || partEl.visible || a.part === 'container') continue;
    const appearsIn = states.filter(s => s.detected && s.changes.some(c => c.part === a.part)).map(s => s.state);
    if (appearsIn.length) a.appearsIn = appearsIn;
  }
  const motion = [
    ...motionOf(el),
    ...[...changing].filter(p => p !== 'container' && all.has(p)).flatMap(part => motionOf(all.get(part)!).map(m => ({ part, ...m })))
  ];
  // Image slots, named as the anatomy names their element; an image the anatomy does not list yet
  // (deeper than parts are read, or a div with a background photo) becomes a new "image" part
  const partOf = new Map<number, string>();
  for (const [part, e] of all) if (part === 'container' || anatomy.some(a => a.part === part)) partOf.set(e.id, part);
  partOf.set(el.id, 'container');
  const images: ComponentImage[] = [];
  for (const { el: imageEl, reading } of options.images ?? []) {
    let part = partOf.get(imageEl.id);
    if (!part) {
      const n = (counters.get('image') ?? 0) + 1;
      counters.set('image', n);
      part = n > 1 ? `image-${n}` : 'image';
      partOf.set(imageEl.id, part);
      anatomy.push({
        part,
        element: elementName(imageEl.tag, imageEl.role),
        styles: [{ property: 'width', value: sizeValue(imageEl, 'width') }, { property: 'height', value: sizeValue(imageEl, 'height') },
          ...boxStyles(snap, imageEl).filter(s => !['display', 'width', 'height'].includes(s.property))]
      });
    }
    images.push(imageSlot(reading, part));
  }
  const layoutTree = buildLayoutTree(anatomy);
  const icons = anatomy.filter(a => a.icon).map(a => ({ part: a.part, icon: a.icon! }));
  const hostDoc = options.nodes?.[el.id]?.ownerDocument;
  const stack = options.stack ?? (hostDoc ? detectSiteStack(hostDoc) : undefined);
  const rawParts = componentParts(snap, el, inside);
  const partMap = new Map(rawParts.map(p => [p.part, p.el]));
  return {
    meta: { name, scope: 'component', type: componentType(el, width), source: snap.url, selector: el.selector, captured: options.captured ?? today(), method: 'measured' },
    tokens: tokensOf(snap, [...anatomy, ...images.map(i => ({ styles: i.treatment }))]),
    anatomy,
    ...(layoutTree ? { layoutTree } : {}),
    ...(images.length ? { images } : {}),
    ...(icons.length ? { icons } : {}),
    ...(stack && Object.keys(stack).length ? { stack } : {}),
    states,
    motion,
    accessibility: componentAccessibility(snap, el, anatomy.map(a => ({ part: a.part, el: (a as any)._el ?? partMap.get(a.part) ?? all.get(a.part) ?? el })), states),
    ...(options.system ? { variants: variantsOf(snap, el, name, options.within) } : {})
  };
}

/** One image inside a component, as read from the live page (image.ts readImage). */
export interface ComponentImageInput {
  el: ElementSnapshot;
  reading: ImageReading;
}
