/**
 * The Color tool (FR13, FR14): one color (from an element or the eyedropper), and the page's
 * color system. Every color a visible element uses appears, each with a role.
 */
import { converter } from 'culori';
import { colorKey, isTransparent, parseColor, toCaptureName, type ColorRole, type ColorSet, type ColorSystem, type ColorToken } from '@luci-dev/format/capture';
import { tokenOf, type ElementSnapshot, type PageSnapshot, type SnapshotProperty } from './model.js';
import { elementName } from './naming.js';

const today = () => new Date().toISOString().slice(0, 10);
const toOklch = converter('oklch');

/**
 * Custom property names the format holds. Others are left out of the token list: e.g. Webflow's
 * deleted variables, "--color--sand-100<deleted|variable-203dfcdb-...>" (lattice.com, 2026-11-13).
 */
const TOKEN_NAME = /^--[\w-]+$/;

/** Colors with at least this much chroma (OKLCH) are accents; the rest are neutrals. */
export const ACCENT_CHROMA = 0.06;

export function isChromatic(computed: string): boolean {
  const c = parseColor(computed);
  return Boolean(c && (toOklch(c).c ?? 0) >= ACCENT_CHROMA);
}

export interface ColorUse {
  el: ElementSnapshot;
  property: SnapshotProperty;
  computed: string;
  key: string;
  role: ColorRole;
  token?: string;
  authored?: string;
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const SVG_SHAPES: ReadonlySet<string> = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);

/** Every color an element applies, with the role it plays. */
export function colorUses(el: ElementSnapshot): ColorUse[] {
  const uses: ColorUse[] = [];
  const add = (property: SnapshotProperty, neutralRole: ColorRole) => {
    const computed = el.styles[property];
    if (!computed || isTransparent(computed)) return;
    const key = colorKey(computed);
    if (!key) return;
    const authored = el.authored[property];
    const token = tokenOf(authored);
    uses.push({ el, property, computed, key, role: isChromatic(computed) ? 'accent' : neutralRole, ...(token ? { token } : {}), ...(authored ? { authored } : {}) });
  };
  if (el.hasText) add('color', 'text');
  add('background-color', 'background');
  for (const side of SIDES) {
    const width = parseFloat(el.styles[`border-${side}-width`] ?? '0');
    const style = el.styles[`border-${side}-style`] ?? 'none';
    if (width > 0 && style !== 'none' && style !== 'hidden') add(`border-${side}-color`, 'border');
  }
  // Fill and stroke paint only on shapes (the <svg> and <g> elements carry a default black fill they never paint)
  if (SVG_SHAPES.has(el.tag)) {
    add('fill', 'text');
    if (parseFloat(el.styles['stroke-width'] ?? '1') !== 0) add('stroke', 'text');
  }
  return uses;
}

export const allColorUses = (snapshot: PageSnapshot) => snapshot.elements.filter(e => e.visible).flatMap(colorUses);

/** The color system of the page (FR14). Null when no visible element applies a color. */
export function colorSystem(snapshot: PageSnapshot, options: { captured?: string } = {}): ColorSystem | null {
  const uses = allColorUses(snapshot);
  if (!uses.length) return null;
  const groups = new Map<string, ColorUse[]>();
  for (const u of uses) groups.set(`${u.role}|${u.key}`, [...(groups.get(`${u.role}|${u.key}`) ?? []), u]);
  const ORDER: readonly ColorRole[] = ['background', 'text', 'border', 'accent'];
  const roles = [...groups.values()]
    .map(list => {
      const tokened = list.find(u => u.token);
      const first = tokened ?? list[0]!;
      return {
        role: first.role,
        value: { computed: first.computed, ...(tokened?.authored ? { authored: tokened.authored } : {}), ...(tokened?.token ? { token: tokened.token } : {}) },
        count: list.length,
        properties: [...new Set(list.map(u => u.property))].sort()
      };
    })
    .sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.count - a.count || a.value.computed.localeCompare(b.value.computed));

  // Color custom properties on :root, with how often elements use each one
  const tokenUses = new Map<string, number>();
  for (const u of uses) if (u.token) tokenUses.set(u.token, (tokenUses.get(u.token) ?? 0) + 1);
  const tokens = Object.entries(snapshot.customProperties)
    .filter(([token, v]) => TOKEN_NAME.test(token) && colorKey(v) !== null && !/^-?\d/.test(v.trim()))
    .map(([token, value]) => ({ token, value: value.trim(), count: tokenUses.get(token) ?? 0 }))
    .sort((a, b) => a.token.localeCompare(b.token));

  return {
    meta: { name: 'color', scope: 'system', type: 'color', source: snapshot.url, captured: options.captured ?? today(), method: 'measured' },
    roles,
    tokens
  };
}

const nameFor = (computed: string, token: string | undefined) =>
  toCaptureName(token ? `color-${token.replace(/^--(colou?r-)?/i, '')}` : `color-${(colorKey(computed) ?? 'value').replace('#', '')}`);

/** The first value for each key, in order. */
function firstOfEach<T>(items: readonly { key: string; value: T }[]): T[] {
  const seen = new Map<string, T>();
  for (const { key, value } of items) if (!seen.has(key)) seen.set(key, value);
  return [...seen.values()];
}

/** "Where used" lists each kind of element and property once, at most this many. */
export const MAX_USED_FOR = 12;

/**
 * One color (FR13). From an element: its main color (background, else text, else border).
 * From a pixel (the eyedropper): when the pixel matches a color an element uses, it resolves to
 * that color and its token; otherwise it is marked estimated.
 */
export function colorToken(snapshot: PageSnapshot, pick: { element: ElementSnapshot } | { pixel: string }, options: { captured?: string } = {}): ColorToken | null {
  const captured = options.captured ?? today();
  const uses = allColorUses(snapshot);
  let key: string | null;
  let selector: string | undefined;
  if ('element' in pick) {
    const own = colorUses(pick.element);
    const main = own.find(u => u.property === 'background-color') ?? own.find(u => u.property === 'color') ?? own[0];
    if (!main) return null;
    key = main.key;
    selector = pick.element.selector;
  } else {
    key = colorKey(pick.pixel);
    if (!key) return null;
  }
  const same = uses.filter(u => u.key === key);
  const tokened = same.find(u => u.token);
  const first = tokened ?? same[0];
  const computed = first?.computed ?? (('pixel' in pick) ? pick.pixel : '');
  const roleCounts = new Map<ColorRole, number>();
  for (const u of same) roleCounts.set(u.role, (roleCounts.get(u.role) ?? 0) + 1);
  const role = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    meta: { name: nameFor(computed, tokened?.token), scope: 'token', type: 'color', source: snapshot.url, ...(selector ? { selector } : {}), captured, method: same.length ? 'measured' : 'estimated' },
    value: { computed, ...(tokened?.authored ? { authored: tokened.authored } : {}), ...(tokened?.token ? { token: tokened.token } : {}) },
    ...(role ? { role } : {}),
    usedFor: firstOfEach(same.map(u => {
      const element = elementName(u.el.tag, u.el.role);
      return { key: `${element}|${u.property}`, value: { element, property: u.property, selector: u.el.selector } };
    })).slice(0, MAX_USED_FOR)
  };
}

/**
 * All colors used in a component (container and descendants). If only one unique color is used,
 * returns a single ColorToken; if multiple colors are used, returns a ColorSet.
 */
export function componentColorSet(
  snapshot: PageSnapshot,
  container: ElementSnapshot,
  inside: (el: ElementSnapshot) => number | null = (el) => (el.id === container.id ? 0 : null),
  options: { captured?: string } = {}
): ColorSet | ColorToken | null {
  const captured = options.captured ?? today();
  const elements = snapshot.elements.filter(e => e.visible && inside(e) !== null);
  const uses = elements.flatMap(colorUses);
  if (!uses.length) return null;

  const byKey = new Map<string, {
    key: string;
    computed: string;
    authored?: string;
    token?: string;
    roles: Map<ColorRole, number>;
    usedFor: { element: string; property: string; selector: string }[];
  }>();

  for (const u of uses) {
    let group = byKey.get(u.key);
    if (!group) {
      group = {
        key: u.key,
        computed: u.computed,
        roles: new Map(),
        usedFor: []
      };
      byKey.set(u.key, group);
    }
    if (u.authored && !group.authored) group.authored = u.authored;
    if (u.token && !group.token) group.token = u.token;
    group.roles.set(u.role, (group.roles.get(u.role) ?? 0) + 1);

    const elName = elementName(u.el.tag, u.el.role);
    if (!group.usedFor.some(item => item.element === elName && item.property === u.property)) {
      group.usedFor.push({ element: elName, property: u.property, selector: u.el.selector });
    }
  }

  const colors = Array.from(byKey.values()).map(g => {
    const role = [...g.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      value: {
        computed: g.computed,
        ...(g.authored ? { authored: g.authored } : {}),
        ...(g.token ? { token: g.token } : {})
      },
      ...(role ? { role } : {}),
      usedFor: g.usedFor.slice(0, MAX_USED_FOR)
    };
  });

  const containerName = elementName(container.tag, container.role);
  const mainColor = colors.find(c => c.role === 'background' && c.value.token)
    ?? colors.find(c => c.value.token)
    ?? colors.find(c => c.role === 'background')
    ?? colors[0]!;
  const token = mainColor.value.token ?? colors.find(c => c.value.token)?.value.token;
  const name = token ? nameFor(mainColor.value.computed, token) : toCaptureName(`color-${containerName}`);

  if (colors.length === 1) {
    const single = colors[0]!;
    return {
      meta: {
        name,
        scope: 'token',
        type: 'color',
        source: snapshot.url,
        selector: container.selector,
        captured,
        method: 'measured'
      },
      value: single.value,
      ...(single.role ? { role: single.role } : {}),
      usedFor: single.usedFor
    };
  }

  return {
    meta: {
      name,
      scope: 'token',
      type: 'color',
      source: snapshot.url,
      selector: container.selector,
      captured,
      method: 'measured'
    },
    colors,
    usedBy: {
      element: containerName,
      selector: container.selector,
      ...(container.role ? { role: container.role } : {})
    }
  };
}
