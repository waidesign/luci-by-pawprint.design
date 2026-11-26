/**
 * Images inside a component: how each picture is shown (its design treatment), never the picture
 * itself. For every image slot it records the kind, rendered size and shape, the CSS that frames it
 * (fit, position, corners, shadow, filters, mask) and the layers painted over it. No URL and no
 * pixels (FR21): every url(...) becomes "<image>", so the agent puts its own picture in the slot.
 *
 * readImage (browser) reads one element into plain data; imageSlot (pure) makes the file's entry.
 */
import { formatShadow, isTransparent, withoutUrls, type ComponentImage } from '@luci-dev/format/capture';
import { authoredFor, LUCI_UI_ATTRIBUTE, type RuleCache } from './dom.js';
import { hasPhotoBackground } from './eligibility.js';
import { tokenOf } from './model.js';
import { elementName, implicitRole } from './naming.js';

export type ImageKind = ComponentImage['kind'];

/** The properties read for an image, in the order the file lists them. */
export const IMAGE_PROPERTIES = [
  'object-fit', 'object-position', 'aspect-ratio', 'background-size', 'background-position', 'background-repeat', 'background-image',
  'border-radius', 'box-shadow', 'filter', 'opacity', 'mix-blend-mode', 'mask-image', 'clip-path'
] as const;
type ImageProperty = (typeof IMAGE_PROPERTIES)[number];

/** object-* only apply to replaced elements (img, video, canvas); background-* only to a background image. */
const OBJECT_PROPS = new Set<ImageProperty>(['object-fit', 'object-position']);
const BACKGROUND_PROPS = new Set<ImageProperty>(['background-size', 'background-position', 'background-repeat', 'background-image']);
export const propertiesFor = (kind: ImageKind): ImageProperty[] =>
  IMAGE_PROPERTIES.filter(p => (OBJECT_PROPS.has(p) ? ['img', 'video', 'canvas'].includes(kind) : BACKGROUND_PROPS.has(p) ? kind === 'background' : true));

/** Values that mean "nothing set": left out of the file. object-fit is always kept (fill means stretched). */
const UNSET: Partial<Record<ImageProperty, (v: string) => boolean>> = {
  'object-position': v => v === '50% 50%',
  // The browser computes "auto 16 / 9" from width and height attributes: not a design choice
  'aspect-ratio': v => v === 'auto' || v.startsWith('auto '),
  'background-size': v => v === 'auto' || v === 'auto auto',
  'background-position': v => v === '0% 0%',
  'background-repeat': v => v === 'repeat',
  'border-radius': v => /^0px( 0px)*$/.test(v),
  'box-shadow': v => v === 'none' || formatShadow(v) === 'none',
  filter: v => v === 'none',
  opacity: v => v === '1',
  'mix-blend-mode': v => v === 'normal',
  'mask-image': v => v === 'none',
  'clip-path': v => v === 'none'
};
const noRadius = (v: string) => UNSET['border-radius']!(v.trim());

export interface ImageOverlay {
  /** Where the layer is: "::after", "div around it, ::before", "div over it". */
  on: string;
  background: string;
  opacity?: string;
  blend?: string;
}

/** One image as read from the page: plain data, image URLs already removed from overlays. */
export interface ImageReading {
  kind: ImageKind;
  width: number;
  height: number;
  /** The file's own size, when the browser knows it (img, video, canvas). */
  natural?: { width: number; height: number };
  /** Computed values of the properties that apply to its kind. */
  styles: Partial<Record<ImageProperty, string>>;
  authored: Partial<Record<ImageProperty, string>>;
  /** An SVG <image>'s preserveAspectRatio, its own way of fitting ("xMidYMid slice" is cover). */
  preserveAspectRatio?: string;
  /**
   * An element around it that clips its corners (overflow hidden with a radius), when the image has
   * none: "container" when it is the component itself. `corners` when only some touch ("top").
   */
  clip?: { element: string; radius: string; authored?: string; corners?: string };
  overlays: ImageOverlay[];
}

const COMMON_RATIOS: readonly [number, number][] = [[1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [3, 1]];

/** "16:9", "4:5", or "1.85:1" when the shape is not a common one (within 1%). */
export function aspectRatioOf(width: number, height: number): string {
  if (!(width > 0 && height > 0)) return 'unknown';
  const r = width / height;
  for (const [a, b] of COMMON_RATIOS) {
    if (Math.abs(r - a / b) / (a / b) < 0.01) return `${a}:${b}`;
    if (Math.abs(r - b / a) / (b / a) < 0.01) return `${b}:${a}`;
  }
  const n = (x: number) => String(Math.round(x * 100) / 100);
  return r >= 1 ? `${n(r)}:1` : `1:${n(1 / r)}`;
}

/**
 * Background properties come back one value per layer ("cover, cover" for a gradient over a
 * photo). When every layer has the same value, it is written once.
 */
export function oneLayer(value: string): string {
  const layers = value.split(/,(?![^(]*\))/).map(l => l.trim());
  return layers.every(l => l === layers[0]) ? layers[0]! : value;
}

/** "top", "left", "top-left"...: which of the four corners are listed, or undefined for all four. */
export function cornersLabel(touching: { tl: boolean; tr: boolean; br: boolean; bl: boolean }): string | undefined {
  const { tl, tr, br, bl } = touching;
  const n = [tl, tr, br, bl].filter(Boolean).length;
  if (n === 4 || n === 0) return undefined;
  if (n === 2) {
    if (tl && tr) return 'top';
    if (bl && br) return 'bottom';
    if (tl && bl) return 'left';
    if (tr && br) return 'right';
  }
  return [tl && 'top-left', tr && 'top-right', br && 'bottom-right', bl && 'bottom-left'].filter(Boolean).join(' and ');
}

/** One image slot of a component (FR21: structure only, no URL anywhere). */
export function imageSlot(r: ImageReading, part: string): ComponentImage {
  const ratio = aspectRatioOf(r.width, r.height);
  const source = r.natural ? aspectRatioOf(r.natural.width, r.natural.height) : undefined;
  const treatment: ComponentImage['treatment'] = [];
  for (const p of propertiesFor(r.kind)) {
    const raw = r.styles[p];
    const computed = raw && BACKGROUND_PROPS.has(p) && p !== 'background-image' ? oneLayer(raw) : raw;
    if (!computed || UNSET[p]?.(computed)) continue;
    // A background of only the picture itself says nothing; with gradients over it, it does
    if (p === 'background-image' && /^(\s*<image>\s*,?)+$/.test(withoutUrls(computed))) continue;
    const authored = r.authored[p];
    const token = tokenOf(authored);
    treatment.push({
      property: p,
      value: { computed: withoutUrls(computed), ...(authored && authored !== computed ? { authored: withoutUrls(authored) } : {}), ...(token ? { token } : {}) }
    });
  }
  if (r.preserveAspectRatio) treatment.unshift({ property: 'preserveAspectRatio', value: { computed: r.preserveAspectRatio } });
  if (r.clip && !treatment.some(t => t.property === 'border-radius')) {
    const token = tokenOf(r.clip.authored);
    treatment.push({
      property: 'border-radius',
      value: { computed: r.clip.radius, ...(r.clip.authored && r.clip.authored !== r.clip.radius ? { authored: r.clip.authored } : {}), ...(token ? { token } : {}) },
      on: r.clip.element,
      ...(r.clip.corners ? { corners: r.clip.corners } : {})
    });
  }
  return {
    part,
    kind: r.kind,
    size: { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 },
    aspectRatio: ratio,
    ...(source && source !== 'unknown' && source !== ratio ? { sourceAspectRatio: source } : {}),
    treatment,
    overlays: r.overlays.map(o => ({ ...o, background: withoutUrls(o.background) }))
  };
}

// ---------------------------------------------------------------------------------------------
// Reading the page (browser only)

const SVG_NS = 'http://www.w3.org/2000/svg';

/** What kind of image an element is, or null when it is none (a picture element is read through its img). */
export function imageKindOf(el: Element): ImageKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img' || tag === 'video' || tag === 'canvas') return tag;
  if (tag === 'image' && el.namespaceURI === SVG_NS) return 'svg-image';
  if (tag === 'svg' || el.namespaceURI === SVG_NS) return null;
  const bg = el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage;
  return hasPhotoBackground(bg) ? 'background' : null;
}

const nameOf = (el: Element) => elementName(el.tagName.toLowerCase(), el.getAttribute('role') ?? implicitRole(el.tagName.toLowerCase(), { href: el.hasAttribute('href'), type: el.getAttribute('type') ?? undefined }));
const parentOf = (el: Element): Element | null => el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null);

/** The paint of a layer: its background image (URLs removed) over its background color. */
function paintOf(cs: CSSStyleDeclaration): string | null {
  const image = cs.backgroundImage && cs.backgroundImage !== 'none' ? withoutUrls(cs.backgroundImage) : null;
  const color = cs.backgroundColor && !isTransparent(cs.backgroundColor) ? cs.backgroundColor : null;
  return image && color ? `${image} over ${color}` : image ?? color;
}

function overlayOf(cs: CSSStyleDeclaration, on: string): ImageOverlay | null {
  const background = paintOf(cs);
  if (!background || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
  return { on, background, ...(cs.opacity !== '1' ? { opacity: cs.opacity } : {}), ...(cs.mixBlendMode && cs.mixBlendMode !== 'normal' ? { blend: cs.mixBlendMode } : {}) };
}

/** A ::before or ::after painted over its element (positioned, with a background). */
function pseudoOverlay(host: Element, which: '::before' | '::after', on: string): ImageOverlay | null {
  const cs = host.ownerDocument.defaultView!.getComputedStyle(host, which);
  if (cs.content === 'none' || cs.content === 'normal' || !/absolute|fixed/.test(cs.position)) return null;
  return overlayOf(cs, on);
}

const area = (r: DOMRect) => Math.max(0, r.width) * Math.max(0, r.height);
const overlap = (a: DOMRect, b: DOMRect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const near = (a: number, b: number) => Math.abs(a - b) < 1.5;

/**
 * Read one image from the live page. `container` is the component it belongs to: an element around
 * the image up to it can clip the image's corners, and is named "container" when it is the component.
 */
export function readImage(el: Element, container?: Element, cache: RuleCache = new Map()): ImageReading {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const kind = imageKindOf(el) ?? 'img';
  const cs = win.getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const props = propertiesFor(kind);
  const styles: ImageReading['styles'] = {};
  for (const p of props) styles[p] = cs.getPropertyValue(p).trim();
  const authored = authoredFor(el, props, cache) as ImageReading['authored'];

  let natural: ImageReading['natural'];
  if (el instanceof win.HTMLImageElement && el.naturalWidth > 0) natural = { width: el.naturalWidth, height: el.naturalHeight };
  else if (el instanceof win.HTMLVideoElement && el.videoWidth > 0) natural = { width: el.videoWidth, height: el.videoHeight };
  else if (el instanceof win.HTMLCanvasElement && el.width > 0) natural = { width: el.width, height: el.height };
  const preserve = kind === 'svg-image' ? el.getAttribute('preserveAspectRatio')?.trim() || 'xMidYMid meet' : undefined;

  // Elements around it, up to the component (none when the image is the component's own background)
  const ancestors: Element[] = [];
  for (let n = el === container ? null : parentOf(el); n && n !== doc.body && n !== doc.documentElement; n = parentOf(n)) {
    ancestors.push(n);
    if (n === container || (!container && ancestors.length >= 3)) break;
  }

  // The first element around it that clips with rounded corners, where the image reaches a corner
  let clip: ImageReading['clip'];
  if (noRadius(cs.borderRadius) && kind !== 'svg-image') {
    for (const f of ancestors) {
      const fcs = win.getComputedStyle(f);
      if (fcs.overflow === 'visible' || noRadius(fcs.borderRadius)) continue;
      const r = f.getBoundingClientRect();
      const touching = {
        tl: near(box.left, r.left) && near(box.top, r.top), tr: near(box.right, r.right) && near(box.top, r.top),
        br: near(box.right, r.right) && near(box.bottom, r.bottom), bl: near(box.left, r.left) && near(box.bottom, r.bottom)
      };
      if (!Object.values(touching).some(Boolean)) continue;
      const a = authoredFor(f, ['border-radius'], cache)['border-radius'];
      const corners = cornersLabel(touching);
      clip = { element: f === container ? 'container' : nameOf(f), radius: fcs.borderRadius.trim(), ...(a ? { authored: a } : {}), ...(corners ? { corners } : {}) };
      break;
    }
  }

  // Elements around the image that have its size frame it: they can carry layers over it
  const frames: Element[] = [];
  for (const n of ancestors.slice(0, 3)) {
    const r = n.getBoundingClientRect();
    if (area(r) > area(box) * 1.15 || overlap(r, box) < area(box) * 0.9) break;
    frames.push(n);
  }
  const overlays: ImageOverlay[] = [];
  const add = (o: ImageOverlay | null) => { if (o) overlays.push(o); };
  // An element with a background image can paint layers over it itself, and hold one as a child
  // (img, video and canvas have no ::before or ::after)
  if (kind === 'background') {
    add(pseudoOverlay(el, '::before', '::before'));
    add(pseudoOverlay(el, '::after', '::after'));
  }
  const layerOver = (child: Element, on: string) => {
    if (child.hasAttribute(LUCI_UI_ATTRIBUTE) || (child.textContent ?? '').trim()) return;
    const ccs = win.getComputedStyle(child);
    if (!/absolute|fixed/.test(ccs.position) || overlap(child.getBoundingClientRect(), box) < area(box) * 0.9) return;
    add(overlayOf(ccs, on));
  };
  if (kind === 'background') for (const child of Array.from(el.children)) layerOver(child, `${nameOf(child)} over it`);
  let branch: Element = el;
  for (const f of frames) {
    add(pseudoOverlay(f, '::before', `${nameOf(f)} around it, ::before`));
    add(pseudoOverlay(f, '::after', `${nameOf(f)} around it, ::after`));
    for (const child of Array.from(f.children)) if (child !== branch) layerOver(child, `${nameOf(child)} over it`);
    branch = f;
  }

  return {
    kind,
    width: box.width,
    height: box.height,
    ...(natural ? { natural } : {}),
    styles,
    authored,
    ...(preserve ? { preserveAspectRatio: preserve } : {}),
    ...(clip ? { clip } : {}),
    overlays
  };
}

/** At most this many image slots per component. */
export const MAX_IMAGES = 12;

/**
 * The images inside a component (the component itself included, for a background photo), in page
 * order, as live elements. A picture element counts through its img; an inline svg drawing is not
 * an image (it is an icon or illustration part), but an SVG <image> inside it is.
 */
export function imagesInside(container: Element): Element[] {
  const out: Element[] = [];
  const visit = (el: Element) => {
    if (out.length >= MAX_IMAGES || el.hasAttribute(LUCI_UI_ATTRIBUTE)) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && imageKindOf(el)) out.push(el);
    for (const child of Array.from(el.shadowRoot?.children ?? [])) visit(child);
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(container);
  return out;
}
