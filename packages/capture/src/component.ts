/**
 * The Component tool (FR7, FR9, FR10, FR17): one component's tokens, anatomy and motion, and, for
 * "The whole system", the similar elements on the page grouped as variants. States come from
 * states.ts. Works on the page snapshot only, so it is the same in both toolbar shells.
 */
import { buildLayoutTree, colorKey, isTransparent, round, toCaptureName, withoutUrls, type CapturedValue, type ComponentCapture, type ComponentImage, type SiteStack } from '@luci-dev/format/capture';
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
const TEXT: readonly SnapshotProperty[] = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'text-transform', 'text-decoration-line'];
/** Values that mean "nothing set" for a property. */
const NOTHING: Partial<Record<SnapshotProperty, RegExp>> = {
  'row-gap': /^(normal|0px)$/, 'column-gap': /^(normal|0px)$/, 'border-radius': /^0px$/, 'box-shadow': /^none$/,
  'background-image': /^none$/, opacity: /^1$/, cursor: /^auto$/, 'outline-offset': /^0px$/, 'text-align': /^(start|left)$/,
  'letter-spacing': /^normal$/, 'text-transform': /^none$/, 'text-decoration-line': /^none$/,
  'flex-direction': /^row$/, 'align-items': /^normal$/, 'justify-content': /^normal$/, transform: /^none$/,
  'grid-template-columns': /^none$/, 'flex-wrap': /^nowrap$/, 'max-width': /^none$/
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
  // A background photo's address is never kept (FR21); its slot is described under Images
  for (const p of BOX.slice(6)) if (own(snap, el, p)) add(p, p === 'background-image' ? noUrls(valueOf(el, p)) : valueOf(el, p));
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
    const name = ['icon', 'image'].includes(kind) || el.hasText ? kind : 'decoration';
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    parts.push({ part: n > 1 ? `${name}-${n}` : name, el });
  }
  return parts;
}

export function anatomyOf(snap: PageSnapshot, container: ElementSnapshot, inside: (el: ElementSnapshot) => number | null, options: { nodes?: Element[] } = {}): ComponentCapture['anatomy'] {
  const containerLayout = computeElementLayout(container);
  const parts: ComponentCapture['anatomy'] = [{
    part: 'container',
    element: elementName(container.tag, container.role),
    depth: 0,
    ...(containerLayout ? { layout: containerLayout } : {}),
    styles: boxStyles(snap, container)
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

  const rawParts = componentParts(snap, container, inside).slice(1);
  for (const { part, el } of rawParts) {
    elToPart.set(el.id, part);
    partToEl.set(part, el);
  }

  for (const { part, el } of rawParts) {
    const name = part.replace(/-\d+$/, '');
    const isIcon = name === 'icon' || name === 'image';
    const styles = isIcon
      ? [{ property: 'width', value: { computed: `${round(el.rect.width)}px` } }, { property: 'height', value: { computed: `${round(el.rect.height)}px` } },
        ...(['fill', 'color'] as const).filter(p => el.styles[p] && el.styles[p] !== 'none' && el.tag !== 'img' && el.tag !== 'image').slice(0, 1).map(p => ({ property: p, value: valueOf(el, p) }))]
      : [...textStyles(el), ...boxStyles(snap, el).filter(s => s.property !== 'display')];

    let parent = 'container';
    for (let cur = el.parent; cur !== undefined && cur !== container.id; cur = snap.elements[cur]?.parent) {
      const match = elToPart.get(cur);
      if (match) { parent = match; break; }
    }
    const parentEl = partToEl.get(parent) ?? container;
    const layout = computeElementLayout(el, parentEl);
    const depth = (parts.find(p => p.part === parent)?.depth ?? 0) + 1;
    const icon = (isIcon || el.tag === 'svg') && options.nodes?.[el.id] ? identifyIcon(options.nodes[el.id]!) ?? undefined : undefined;

    parts.push({
      part,
      element: elementName(el.tag, el.role),
      parent,
      depth,
      ...(layout ? { layout } : {}),
      ...(icon ? { icon } : {}),
      styles
    });
  }
  return parts;
}

/** Custom properties the component's parts (and its images) use, with resolved values and what they set. */
export function tokensOf(snap: PageSnapshot, anatomy: readonly { styles: readonly { property: string; value: CapturedValue }[] }[]): ComponentCapture['tokens'] {
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

/**
 * Similar elements on the page (same tag and type), grouped by how they look, the picked one's group
 * first, each with its variant name. `within` limits them to part of the page (a section).
 */
export function variantGroups(snap: PageSnapshot, picked: ElementSnapshot, name: string, within?: (el: ElementSnapshot) => boolean): { name: string; elements: ElementSnapshot[] }[] {
  const type = componentType(picked);
  const similar = snap.elements.filter(e => e.visible && e.tag === picked.tag && componentType(e) === type && (!within || within(e)));
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
    const differences = VARIANT_PROPS.filter(p => (/color$/.test(p) ? colorKey(example.styles[p] ?? '') !== colorKey(picked.styles[p] ?? '') : example.styles[p] !== picked.styles[p]))
      .map(p => ({ property: p, value: valueOf(example, p) }));
    return { name: variant, count: elements.length, selector: example.selector, differences };
  });
}

/** A component's name: its type, "primary-" when its background is an accent color. */
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
  options: { captured?: string; system?: boolean; states?: ComponentCapture['states']; images?: readonly ComponentImageInput[]; within?: (el: ElementSnapshot) => boolean; nodes?: Element[]; stack?: SiteStack } = {}
): ComponentCapture {
  const name = componentName(el);
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
      ? [{ property: 'width', value: { computed: `${round(partEl.rect.width)}px` } }, { property: 'height', value: { computed: `${round(partEl.rect.height)}px` } }, ...boxStyles(snap, partEl).filter(s => !['display', 'width', 'height'].includes(s.property))]
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
        styles: [{ property: 'width', value: { computed: `${round(imageEl.rect.width)}px` } }, { property: 'height', value: { computed: `${round(imageEl.rect.height)}px` } },
          ...boxStyles(snap, imageEl).filter(s => !['display', 'width', 'height'].includes(s.property))]
      });
    }
    images.push(imageSlot(reading, part));
  }
  const layoutTree = buildLayoutTree(anatomy);
  const icons = anatomy.filter(a => a.icon).map(a => ({ part: a.part, icon: a.icon! }));
  const hostDoc = options.nodes?.[el.id]?.ownerDocument;
  const stack = options.stack ?? (hostDoc ? detectSiteStack(hostDoc) : undefined);
  return {
    meta: { name, scope: 'component', type: componentType(el), source: snap.url, selector: el.selector, captured: options.captured ?? today(), method: 'measured' },
    tokens: tokensOf(snap, [...anatomy, ...images.map(i => ({ styles: i.treatment }))]),
    anatomy,
    ...(layoutTree ? { layoutTree } : {}),
    ...(images.length ? { images } : {}),
    ...(icons.length ? { icons } : {}),
    ...(stack && Object.keys(stack).length ? { stack } : {}),
    states,
    motion,
    accessibility: componentAccessibility(snap, el, componentParts(snap, el, inside), states),
    ...(options.system ? { variants: variantsOf(snap, el, name, options.within) } : {})
  };
}

/** One image inside a component, as read from the live page (image.ts readImage). */
export interface ComponentImageInput {
  el: ElementSnapshot;
  reading: ImageReading;
}
