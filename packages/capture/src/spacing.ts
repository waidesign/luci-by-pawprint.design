/**
 * The Spacing tool (FR15, FR16): padding, margin and gap of one element (authored), the distance
 * between two elements (measured), and the page's spacing system: scale, base unit, outliers.
 */
import { findBaseUnit, isMultipleOf, pxValue, round, toCaptureName, type SpacingSet, type SpacingSystem, type SpacingToken } from '@luci-dev/format/capture';
import { tokenOf, type ElementSnapshot, type PageSnapshot, type Rect, type SnapshotProperty } from './model.js';
import { elementName } from './naming.js';

const today = () => new Date().toISOString().slice(0, 10);

export interface SpacingUse {
  el: ElementSnapshot;
  property: SnapshotProperty;
  kind: 'padding' | 'margin' | 'gap';
  px: number;
  computed: string;
  authored?: string;
  token?: string;
}

const PROPS: readonly [SnapshotProperty, SpacingUse['kind']][] = [
  ['padding-top', 'padding'], ['padding-right', 'padding'], ['padding-bottom', 'padding'], ['padding-left', 'padding'],
  ['margin-top', 'margin'], ['margin-right', 'margin'], ['margin-bottom', 'margin'], ['margin-left', 'margin'],
  ['row-gap', 'gap'], ['column-gap', 'gap']
];
const GAP_DISPLAYS = /\b(flex|grid)\b/;

/** The spacing one element sets: positive px values, without the browser's defaults. */
export function spacingUses(el: ElementSnapshot): SpacingUse[] {
  const out: SpacingUse[] = [];
  for (const [property, kind] of PROPS) {
    if (el.browserDefault?.[property]) continue;
    if (kind === 'gap' && !GAP_DISPLAYS.test(el.styles.display ?? '')) continue;
    const computed = el.styles[property];
    const px = computed ? pxValue(computed) : null;
    if (px === null || px <= 0) continue;
    const authored = el.authored[property];
    // "margin: 0 auto" centers a block: its px depend on the window, they are no spacing step (B-05)
    if (kind === 'margin' && authored?.trim().toLowerCase() === 'auto') continue;
    const token = tokenOf(authored);
    out.push({ el, property, kind, px, computed: `${round(px)}px`, ...(authored ? { authored } : {}), ...(token ? { token } : {}) });
  }
  return out;
}

/** Above this, equal side margins on a centered block are taken for "auto" when the sheets can't be read. */
export const AUTO_MARGIN_MIN_PX = 64;

/**
 * Elements whose left and right margins look like "auto" centering when the stylesheets could not be
 * read (so "auto" is not known): equal, large, no value read for them, and the block sits in the
 * middle of its parent (B-05).
 */
function centeredByAuto(snapshot: PageSnapshot): Set<number> {
  const byId = new Map(snapshot.elements.map(e => [e.id, e]));
  const out = new Set<number>();
  for (const el of snapshot.elements) {
    if (el.authored['margin-left'] || el.authored['margin-right']) continue;
    const left = pxValue(el.styles['margin-left'] ?? ''), right = pxValue(el.styles['margin-right'] ?? '');
    if (left === null || right === null || left < AUTO_MARGIN_MIN_PX || Math.abs(left - right) > 1) continue;
    const parent = el.parent !== undefined ? byId.get(el.parent) : undefined;
    if (!parent) continue;
    const before = el.rect.x - parent.rect.x, after = parent.rect.x + parent.rect.width - (el.rect.x + el.rect.width);
    if (Math.abs(before - after) <= 1) out.add(el.id);
  }
  return out;
}

// The base unit finder moved to @luci-dev/format in v0.3.3 (site-level systems use it too); same names here
export { BASE_UNITS, BASE_UNIT_MIN_STEPS, BASE_UNIT_REFINE, BASE_UNIT_REFINE_MIN, BASE_UNIT_SHARE, MULTIPLE_TOLERANCE, findBaseUnit } from '@luci-dev/format/capture';
const isMultiple = isMultipleOf;

/** The spacing system of the page (FR16). Null when nothing on the page sets spacing. */
export function spacingSystem(snapshot: PageSnapshot, options: { captured?: string } = {}): SpacingSystem | null {
  const centered = snapshot.stylesReadable === false ? centeredByAuto(snapshot) : new Set<number>();
  const uses = snapshot.elements.filter(e => e.visible).flatMap(spacingUses)
    .filter(u => !(u.kind === 'margin' && (u.property === 'margin-left' || u.property === 'margin-right') && centered.has(u.el.id)));
  if (!uses.length) return null;
  const byValue = new Map<string, { px: number; count: number; tokens: Map<string, number>; authored: Map<string, number> }>();
  for (const u of uses) {
    const entry = byValue.get(u.computed) ?? { px: u.px, count: 0, tokens: new Map<string, number>(), authored: new Map<string, number>() };
    entry.count++;
    if (u.token) entry.tokens.set(u.token, (entry.tokens.get(u.token) ?? 0) + 1);
    if (u.authored) entry.authored.set(u.authored, (entry.authored.get(u.authored) ?? 0) + 1);
    byValue.set(u.computed, entry);
  }
  const values = [...byValue.entries()].sort((a, b) => a[1].px - b[1].px);
  const base = findBaseUnit(values.map(([, v]) => v));
  const toValue = (computed: string, v: { tokens: Map<string, number>; authored: Map<string, number> }) => {
    const bestToken = v.tokens.size ? [...v.tokens.entries()].sort((a, b) => b[1] - a[1])[0]![0] : undefined;
    let dominantAuthored: string | undefined;
    if (bestToken) {
      for (const u of uses) {
        if (u.computed === computed && u.token === bestToken && u.authored) {
          dominantAuthored = u.authored;
          break;
        }
      }
    }
    if (!dominantAuthored && v.authored.size) {
      dominantAuthored = [...v.authored.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
    return { computed, ...(dominantAuthored ? { authored: dominantAuthored } : {}), ...(bestToken ? { token: bestToken } : {}) };
  };
  return {
    meta: { name: 'spacing', scope: 'system', type: 'spacing', source: snapshot.url, captured: options.captured ?? today(), method: 'measured' },
    scale: values.map(([computed, v]) => ({ value: toValue(computed, v), count: v.count })),
    baseUnit: base,
    outliers: base ? values.filter(([, v]) => !isMultiple(v.px, base.px)).map(([computed, v]) => ({ value: toValue(computed, v), count: v.count })) : []
  };
}

/** One spacing value set on an element (FR15 hover), labelled authored. */
export function spacingToken(snapshot: PageSnapshot, use: SpacingUse, options: { captured?: string } = {}): SpacingToken {
  return {
    meta: { name: toCaptureName(`spacing-${use.el.tag}-${use.property}`), scope: 'token', type: 'spacing', source: snapshot.url, selector: use.el.selector, captured: options.captured ?? today(), method: 'measured' },
    value: { computed: use.computed, ...(use.authored ? { authored: use.authored } : {}), ...(use.token ? { token: use.token } : {}) },
    kind: use.kind,
    property: use.property,
    label: 'authored',
    usedBy: { element: elementName(use.el.tag, use.el.role), selector: use.el.selector }
  };
}

/** Every spacing value one element sets, in one file (the Spacing tool's "All"). Null when it sets none. */
export function spacingSet(snapshot: PageSnapshot, el: ElementSnapshot, options: { captured?: string } = {}): SpacingSet | null {
  const uses = spacingUses(el);
  if (!uses.length) return null;
  return {
    meta: { name: toCaptureName(`spacing-${el.tag}`), scope: 'token', type: 'spacing', source: snapshot.url, selector: el.selector, captured: options.captured ?? today(), method: 'measured' },
    values: uses.map(u => ({
      value: { computed: u.computed, ...(u.authored ? { authored: u.authored } : {}), ...(u.token ? { token: u.token } : {}) },
      kind: u.kind,
      property: u.property
    })),
    usedBy: { element: elementName(el.tag, el.role), selector: el.selector }
  };
}

/**
 * The gap between two boxes along the axis that separates them: vertical when they overlap
 * horizontally, horizontal when they overlap vertically, else the larger of the two. 0 when they overlap.
 */
export function distanceBetween(a: Rect, b: Rect): { px: number; axis: 'vertical' | 'horizontal' } {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return dy >= dx ? { px: dy, axis: 'vertical' } : { px: dx, axis: 'horizontal' };
}

/** The measured distance between two picked elements (FR15 drag). */
export function distanceToken(snapshot: PageSnapshot, a: ElementSnapshot, b: ElementSnapshot, options: { captured?: string } = {}): SpacingToken {
  const d = distanceBetween(a.rect, b.rect);
  return {
    meta: { name: toCaptureName(`spacing-${a.tag}-to-${b.tag}`), scope: 'token', type: 'spacing', source: snapshot.url, captured: options.captured ?? today(), method: 'measured' },
    value: { computed: `${round(d.px, 2)}px` },
    kind: 'distance',
    label: 'measured',
    between: [
      { element: elementName(a.tag, a.role), selector: a.selector },
      { element: elementName(b.tag, b.role), selector: b.selector }
    ]
  };
}
