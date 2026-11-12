/**
 * The Spacing tool (FR15, FR16): padding, margin and gap of one element (authored), the distance
 * between two elements (measured), and the page's spacing system: scale, base unit, outliers.
 */
import { pxValue, round, toCaptureName, type SpacingSystem, type SpacingToken } from '@luci/format/capture';
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
    const token = tokenOf(authored);
    out.push({ el, property, kind, px, computed: `${round(px)}px`, ...(authored ? { authored } : {}), ...(token ? { token } : {}) });
  }
  return out;
}

/** Sub-pixel rounding only: 10.5px is not a multiple of 2px. */
export const MULTIPLE_TOLERANCE = 0.25;
const isMultiple = (v: number, unit: number) => {
  const n = Math.round(v / unit);
  return n >= 1 && Math.abs(v - n * unit) <= MULTIPLE_TOLERANCE;
};

/** Candidate base units, largest first. */
export const BASE_UNITS = [16, 12, 10, 8, 6, 5, 4, 3, 2] as const;
/** A base unit must fit at least this share of uses, and at least this many distinct values. */
export const BASE_UNIT_SHARE = 0.75;
export const BASE_UNIT_MIN_STEPS = 3;

/** A smaller unit replaces the chosen one when it explains at least this much more of the uses... */
export const BASE_UNIT_REFINE = 0.1;
/** ...and is at least this large (2px and 3px explain almost anything). */
export const BASE_UNIT_REFINE_MIN = 4;

/**
 * The unit most spacing uses are multiples of, or null when none fits well enough: the largest
 * candidate that fits at least 75% of uses and 3 distinct values; then a smaller divisor (4px or
 * more) that explains 10 points more of the uses wins, so a 4px scale with a few 12px values is
 * not read as 8px.
 */
export function findBaseUnit(values: readonly { px: number; count: number }[]): { px: number; share: number } | null {
  const total = values.reduce((n, v) => n + v.count, 0);
  if (!total) return null;
  const shareOf = (unit: number) => values.filter(v => isMultiple(v.px, unit)).reduce((n, v) => n + v.count, 0) / total;
  const steps = (unit: number) => values.filter(v => isMultiple(v.px, unit)).length;
  let best: number | null = null;
  for (const unit of BASE_UNITS) {
    if (shareOf(unit) >= BASE_UNIT_SHARE && steps(unit) >= Math.min(BASE_UNIT_MIN_STEPS, values.length)) { best = unit; break; }
  }
  if (best === null) return null;
  for (const unit of BASE_UNITS) {
    if (unit < best && unit >= BASE_UNIT_REFINE_MIN && best % unit === 0 && shareOf(unit) >= shareOf(best) + BASE_UNIT_REFINE) best = unit;
  }
  return { px: best, share: Number(shareOf(best).toFixed(2)) };
}

/** The spacing system of the page (FR16). Null when nothing on the page sets spacing. */
export function spacingSystem(snapshot: PageSnapshot, options: { captured?: string } = {}): SpacingSystem | null {
  const uses = snapshot.elements.filter(e => e.visible).flatMap(spacingUses);
  if (!uses.length) return null;
  const byValue = new Map<string, { px: number; count: number; tokens: Set<string>; authored: Set<string> }>();
  for (const u of uses) {
    const entry = byValue.get(u.computed) ?? { px: u.px, count: 0, tokens: new Set<string>(), authored: new Set<string>() };
    entry.count++;
    entry.tokens.add(u.token ?? '');
    entry.authored.add(u.authored ?? '');
    byValue.set(u.computed, entry);
  }
  const values = [...byValue.entries()].sort((a, b) => a[1].px - b[1].px);
  const base = findBaseUnit(values.map(([, v]) => v));
  const toValue = (computed: string, v: { tokens: Set<string>; authored: Set<string> }) => {
    // Token and authored value only when every use of the value shares them
    const token = v.tokens.size === 1 ? [...v.tokens][0] : '';
    const authored = v.authored.size === 1 ? [...v.authored][0] : '';
    return { computed, ...(authored ? { authored } : {}), ...(token ? { token } : {}) };
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
