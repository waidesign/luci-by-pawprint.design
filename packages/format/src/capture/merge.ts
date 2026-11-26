/**
 * Multi-page system merge (v0.3.3): one system (typography, color or spacing) captured on several
 * pages of a site becomes one site-level system. Rows are unified by what they are, not by how a
 * page named them: text styles by their look (first font, size, weight, line height, letter spacing,
 * color), colors by colorKey within a role, spacing by px. Uses are summed, each row lists the pages
 * that use it, and conflicts are listed: a text role, or a token, with different values on
 * different pages. Pure and browser-safe: the toolbar merges basket items with it.
 */
import { cleanSource, siteName } from './format.js';
import { findBaseUnit, isMultipleOf } from './spacingUnit.js';
import { COLOR_ROLES, type Capture, type CapturedValue, type ColorSystem, type SpacingSystem, type SystemConflict, type TextStyle, type TypographySystem } from './schema.js';
import { colorKey, pxValue } from './values.js';

export type SystemCapture = TypographySystem | ColorSystem | SpacingSystem;
export type SystemType = SystemCapture['meta']['type'];

const today = () => new Date().toISOString().slice(0, 10);

/** The pages a system covers: a site-level system's own list, else its source page. */
export const pagesOf = (c: SystemCapture): string[] => c.meta.pages ?? [cleanSource(c.meta.source)];
const rowPages = (row: { pages?: string[] | undefined }, c: SystemCapture) => row.pages ?? pagesOf(c);
const union = (...lists: readonly (readonly string[])[]) => [...new Set(lists.flat())];

/** The site's root address ("https://example.com/"), the source of a site-level system. */
export function siteRoot(url: string): string {
  const u = new URL(url);
  return u.origin === 'null' ? cleanSource(url) : `${u.origin}/`;
}

export const isSystem = (c: Capture): c is SystemCapture => c.meta.scope === 'system';

/**
 * Basket items that can merge: single-page systems of one type on one site, from two pages or more.
 * When a page was captured twice, its latest capture counts. Site-level systems are results, not inputs.
 */
export function mergeGroups<T extends { capture: Capture }>(items: readonly T[]): { site: string; type: SystemType; items: T[]; pages: string[] }[] {
  const groups = new Map<string, Map<string, T>>();
  for (const item of items) {
    const c = item.capture;
    if (!isSystem(c) || c.meta.pages) continue;
    const key = `${siteName(c.meta.source) || cleanSource(c.meta.source)}\0${c.meta.type}`;
    const byPage = groups.get(key) ?? new Map<string, T>();
    byPage.set(cleanSource(c.meta.source), item);
    groups.set(key, byPage);
  }
  return [...groups.entries()]
    .filter(([, byPage]) => byPage.size >= 2)
    .map(([key, byPage]) => {
      const [site, type] = key.split('\0') as [string, SystemType];
      return { site, type, items: [...byPage.values()], pages: [...byPage.keys()] };
    });
}

/** The first font of a family list, as a key: `"Inter", sans-serif` -> "inter". */
const firstFamily = (family: string) => (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
const styleKey = (s: TextStyle) => [
  firstFamily(s.family.computed), s.size.computed, s.weight.computed, s.lineHeight.computed, s.letterSpacing.computed,
  s.style?.computed ?? '', s.transform?.computed ?? '', s.decoration?.computed ?? ''
].join('|');
/** A text style in one line, for a conflict: "Inter, sans-serif 32px/40px 600 rgb(22, 22, 22)". */
const styleLine = (s: TextStyle) =>
  `${s.family.computed} ${s.size.computed}/${s.lineHeight.computed} ${s.weight.computed}${s.letterSpacing.computed !== 'normal' ? ` ${s.letterSpacing.computed}` : ''} ${s.color.computed}`;
/** Page-local numbering ("body-2", "label-3") says nothing across pages; heading levels do. */
const numbered = (role: string) => /-\d+$/.test(role) && !/^heading-\d$/.test(role);

/** A value shared by every row, else nothing (a token or authored value some pages lack or differ on). */
function shared(values: readonly CapturedValue[]): CapturedValue {
  const first = values[0]!;
  const same = (k: 'token' | 'authored') => values.every(v => v[k] === first[k]);
  return { computed: first.computed, ...(first.authored && same('authored') ? { authored: first.authored } : {}), ...(first.token && same('token') ? { token: first.token } : {}) };
}

function conflictsOf(byName: Map<string, Map<string, { value: string; pages: string[] }>>, label: string): SystemConflict[] {
  return [...byName.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([name, values]) => ({ what: `${label} ${name}`, values: [...values.values()].map(v => ({ value: v.value, pages: v.pages })) }));
}
function note(byName: Map<string, Map<string, { value: string; pages: string[] }>>, name: string, key: string, value: string, pages: readonly string[]) {
  const values = byName.get(name) ?? new Map<string, { value: string; pages: string[] }>();
  const v = values.get(key) ?? { value, pages: [] };
  v.pages = union(v.pages, pages);
  values.set(key, v);
  byName.set(name, values);
}

function mergeTypography(list: readonly TypographySystem[]): Pick<TypographySystem, 'roles' | 'families' | 'scale' | 'conflicts'> {
  const groups = new Map<string, { style: TextStyle; count: number; elements: string[]; pages: string[]; names: Map<string, number>; px: number }>();
  const byName = new Map<string, Map<string, { value: string; pages: string[] }>>();
  for (const c of list) for (const r of c.roles) {
    const key = styleKey(r.style);
    const pages = rowPages(r, c);
    const g = groups.get(key) ?? { style: r.style, count: 0, elements: [], pages: [], names: new Map<string, number>(), px: pxValue(r.style.size.computed) ?? 0 };
    g.count += r.count;
    g.elements = union(g.elements, r.elements);
    g.pages = union(g.pages, pages);
    g.names.set(r.role, (g.names.get(r.role) ?? 0) + r.count);
    groups.set(key, g);
    if (!numbered(r.role)) note(byName, r.role, key, styleLine(r.style), pages);
  }
  // Each style keeps the name most of its uses have; the more used style wins a name, the other is numbered
  const taken = new Set<string>();
  const named = [...groups.values()].sort((a, b) => b.count - a.count).map(g => {
    const preferred = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    let role = preferred;
    for (let n = 2; taken.has(role); n++) role = `${preferred}-${n}`;
    taken.add(role);
    return { ...g, role };
  });
  named.sort((a, b) => b.px - a.px || b.count - a.count);

  // One row per font: stacks that start with the same font are one family, written as its most used stack
  const families = new Map<string, { stacks: Map<string, number>; count: number }>();
  for (const c of list) for (const f of c.families) {
    const e = families.get(firstFamily(f.family)) ?? { stacks: new Map<string, number>(), count: 0 };
    e.count += f.count;
    e.stacks.set(f.family, (e.stacks.get(f.family) ?? 0) + f.count);
    families.set(firstFamily(f.family), e);
  }
  const scale = new Map<string, { values: CapturedValue[]; count: number; px: number }>();
  for (const c of list) for (const s of c.scale) {
    const e = scale.get(s.size.computed) ?? { values: [], count: 0, px: pxValue(s.size.computed) ?? 0 };
    e.values.push(s.size);
    e.count += s.count;
    scale.set(s.size.computed, e);
  }
  const conflicts = conflictsOf(byName, 'role');
  return {
    roles: named.map(g => ({ role: g.role, style: g.style, count: g.count, elements: g.elements, pages: g.pages })),
    families: [...families.values()].sort((a, b) => b.count - a.count)
      .map(e => ({ family: [...e.stacks.entries()].sort((a, b) => b[1] - a[1])[0]![0], count: e.count })),
    scale: [...scale.values()].sort((a, b) => b.px - a.px).map(e => ({ size: shared(e.values), count: e.count })),
    ...(conflicts.length ? { conflicts } : {})
  };
}

function mergeColor(list: readonly ColorSystem[]): Pick<ColorSystem, 'roles' | 'tokens' | 'conflicts'> {
  const roles = new Map<string, { role: ColorSystem['roles'][number]['role']; values: CapturedValue[]; count: number; properties: string[]; pages: string[] }>();
  for (const c of list) for (const r of c.roles) {
    const key = `${r.role} ${colorKey(r.value.computed) ?? r.value.computed}`;
    const e = roles.get(key) ?? { role: r.role, values: [], count: 0, properties: [], pages: [] };
    e.values.push(r.value);
    e.count += r.count;
    e.properties = union(e.properties, r.properties);
    e.pages = union(e.pages, rowPages(r, c));
    roles.set(key, e);
  }
  const tokens = new Map<string, Map<string, { value: string; count: number; pages: string[] }>>();
  const byName = new Map<string, Map<string, { value: string; pages: string[] }>>();
  for (const c of list) for (const t of c.tokens) {
    const key = colorKey(t.value) ?? t.value;
    const values = tokens.get(t.token) ?? new Map<string, { value: string; count: number; pages: string[] }>();
    const v = values.get(key) ?? { value: t.value, count: 0, pages: [] };
    v.count += t.count;
    v.pages = union(v.pages, rowPages(t, c));
    values.set(key, v);
    tokens.set(t.token, values);
    note(byName, t.token, key, t.value, rowPages(t, c));
  }
  const conflicts = conflictsOf(byName, 'token');
  return {
    roles: [...roles.values()]
      .sort((a, b) => COLOR_ROLES.indexOf(a.role) - COLOR_ROLES.indexOf(b.role) || b.count - a.count)
      .map(e => ({ role: e.role, value: shared(e.values), count: e.count, properties: e.properties, pages: e.pages })),
    // A token with different values keeps the most used one here; Conflicts lists them all
    tokens: [...tokens.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([token, values]) => {
      const all = [...values.values()];
      const main = [...all].sort((a, b) => b.count - a.count)[0]!;
      return { token, value: main.value, count: all.reduce((n, v) => n + v.count, 0), pages: union(...all.map(v => v.pages)) };
    }),
    ...(conflicts.length ? { conflicts } : {})
  };
}

function mergeSpacing(list: readonly SpacingSystem[]): Pick<SpacingSystem, 'scale' | 'baseUnit' | 'outliers' | 'conflicts'> {
  const values = new Map<string, { values: CapturedValue[]; count: number; px: number; pages: string[] }>();
  const byName = new Map<string, Map<string, { value: string; pages: string[] }>>();
  // A page's outliers are usually in its scale too; any that are not still count
  const rowsOf = (c: SpacingSystem): { value: CapturedValue; count: number; pages?: string[] | undefined }[] =>
    [...c.scale, ...c.outliers.filter(o => !c.scale.some(s => s.value.computed === o.value.computed))];
  for (const c of list) for (const s of rowsOf(c)) {
    const px = pxValue(s.value.computed) ?? 0;
    const e = values.get(s.value.computed) ?? { values: [], count: 0, px, pages: [] };
    e.values.push(s.value);
    e.count += s.count;
    e.pages = union(e.pages, rowPages(s, c));
    values.set(s.value.computed, e);
    if (s.value.token) note(byName, s.value.token, s.value.computed, s.value.computed, rowPages(s, c));
  }
  const sorted = [...values.values()].sort((a, b) => a.px - b.px);
  const baseUnit = findBaseUnit(sorted);
  const conflicts = conflictsOf(byName, 'token');
  return {
    scale: sorted.map(e => ({ value: shared(e.values), count: e.count, pages: e.pages })),
    baseUnit,
    outliers: baseUnit ? sorted.filter(e => !isMultipleOf(e.px, baseUnit.px)).map(e => ({ value: shared(e.values), count: e.count })) : [],
    ...(conflicts.length ? { conflicts } : {})
  };
}

/**
 * Merge one system from several pages of a site into a site-level system. Throws when the systems
 * are of different types or sites, or cover fewer than two pages.
 */
export function mergeSystems<T extends SystemCapture>(captures: readonly T[], options: { captured?: string } = {}): T {
  const first = captures[0];
  if (!first) throw new Error('Nothing to merge.');
  const type = first.meta.type;
  const site = siteName(first.meta.source) || cleanSource(first.meta.source);
  for (const c of captures) {
    if (c.meta.type !== type) throw new Error(`Only one kind of system merges at a time: ${type} and ${c.meta.type}.`);
    if ((siteName(c.meta.source) || cleanSource(c.meta.source)) !== site) throw new Error(`Systems from one site merge: ${site} and ${siteName(c.meta.source)}.`);
  }
  const pages = union(...captures.map(pagesOf));
  if (pages.length < 2) throw new Error('A site-level system needs captures from two pages or more.');
  const meta = {
    name: `site-${type}`, scope: 'system' as const, type, source: siteRoot(first.meta.source), captured: options.captured ?? today(),
    method: captures.every(c => c.meta.method === 'authored') ? 'authored' as const : captures.every(c => c.meta.method === 'measured') ? 'measured' as const : 'estimated' as const, pages
  };
  const body = type === 'typography' ? mergeTypography(captures as readonly TypographySystem[])
    : type === 'color' ? mergeColor(captures as readonly ColorSystem[])
    : mergeSpacing(captures as readonly SpacingSystem[]);
  return { meta, ...body } as T;
}

/**
 * Merges a collection of typography, color, and spacing captures from multiple pages of a site.
 * For each system type: if 2+ pages exist, runs mergeSystems; if 1 page exists, returns it; if 0, returns null.
 */
export function mergeSiteSystems(
  captures: readonly SystemCapture[],
  options: { captured?: string; name?: string } = {}
): {
  site: string;
  pages: string[];
  typography: TypographySystem | null;
  color: ColorSystem | null;
  spacing: SpacingSystem | null;
  conflicts: { type: SystemType; conflict: SystemConflict }[];
} {
  const typos = captures.filter((c): c is TypographySystem => c.meta.type === 'typography');
  const colors = captures.filter((c): c is ColorSystem => c.meta.type === 'color');
  const spacings = captures.filter((c): c is SpacingSystem => c.meta.type === 'spacing');

  const first = captures[0];
  const site = first ? siteName(first.meta.source) || cleanSource(first.meta.source) : '';
  const pages = union(...captures.map(pagesOf));

  const mergeKind = <T extends SystemCapture>(list: readonly T[]): T | null => {
    if (!list.length) return null;
    if (list.length === 1) return list[0]!;
    const p = union(...list.map(pagesOf));
    if (p.length < 2) return list[list.length - 1]!;
    return mergeSystems(list, options);
  };

  const typography = mergeKind(typos);
  const color = mergeKind(colors);
  const spacing = mergeKind(spacings);

  const conflicts: { type: SystemType; conflict: SystemConflict }[] = [
    ...(typography?.conflicts ?? []).map(conflict => ({ type: 'typography' as const, conflict })),
    ...(color?.conflicts ?? []).map(conflict => ({ type: 'color' as const, conflict })),
    ...(spacing?.conflicts ?? []).map(conflict => ({ type: 'spacing' as const, conflict }))
  ];

  return { site, pages, typography, color, spacing, conflicts };
}
