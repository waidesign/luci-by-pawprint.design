/**
 * The Text tool (FR11, FR12): one text style, and the page's typography system. Every distinct
 * text style appears once, grouped into a role named from the elements that use it.
 */
import { colorKey, pxValue, type TextStyle, type TextToken, type TypographySystem } from '@luci/format/capture';
import { contrastOf } from './a11y.js';
import { valueOf, type ElementSnapshot, type PageSnapshot } from './model.js';
import { elementName } from './naming.js';

const today = () => new Date().toISOString().slice(0, 10);

/** The text style of one element. Style, transform and decoration only when they are not the default. */
export function textStyleOf(el: ElementSnapshot): TextStyle {
  const optional = (prop: 'font-style' | 'text-transform' | 'text-decoration-line', none: string) => {
    const v = el.styles[prop];
    return v && v !== none ? valueOf(el, prop) : undefined;
  };
  const style = optional('font-style', 'normal');
  const transform = optional('text-transform', 'none');
  const decoration = optional('text-decoration-line', 'none');
  return {
    family: valueOf(el, 'font-family'),
    size: valueOf(el, 'font-size'),
    weight: valueOf(el, 'font-weight'),
    lineHeight: valueOf(el, 'line-height'),
    letterSpacing: valueOf(el, 'letter-spacing'),
    color: valueOf(el, 'color'),
    ...(style ? { style } : {}),
    ...(transform ? { transform } : {}),
    ...(decoration ? { decoration } : {})
  };
}

/** Two elements share a text style when these match (color is part of the color system, not the style). */
export const styleKey = (el: ElementSnapshot) =>
  ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-style', 'text-transform'].map(p => el.styles[p as 'font-size'] ?? '').join('|');

export const textElements = (snapshot: PageSnapshot) => snapshot.elements.filter(e => e.visible && e.hasText);

type Category = 'heading' | 'code' | 'label' | 'caption' | 'link' | 'body';
function category(el: ElementSnapshot): { category: Category; level?: number } {
  const h = /^h([1-6])$/.exec(el.tag);
  if (h) return { category: 'heading', level: Number(h[1]) };
  if (el.role === 'heading') return { category: 'heading', level: 2 };
  if (['code', 'pre', 'kbd', 'samp'].includes(el.tag)) return { category: 'code' };
  if (['button', 'label', 'th', 'legend', 'option'].includes(el.tag) || ['button', 'tab', 'menuitem'].includes(el.role ?? '')) return { category: 'label' };
  if (['small', 'figcaption', 'caption', 'sub', 'sup', 'time', 'cite'].includes(el.tag)) return { category: 'caption' };
  if (el.tag === 'a') return { category: 'link' };
  return { category: 'body' };
}

const RANK: Readonly<Record<Category, number>> = { heading: 0, body: 1, label: 2, caption: 3, code: 4, link: 5 };
/** How strongly a tag names a text style, for ties: lower wins. */
const tagRank = (tag: string) => RANK[category({ tag, role: null } as ElementSnapshot).category];

export interface TextGroup {
  key: string;
  role: string;
  elements: ElementSnapshot[];
  style: TextStyle;
  /** Tags by use, most used first. */
  tags: string[];
}

const size = (g: { style: TextStyle }) => pxValue(g.style.size.computed) ?? 0;

/** Group the page's text by style and name each group's role. Largest first. */
export function textGroups(snapshot: PageSnapshot): TextGroup[] {
  const byKey = new Map<string, ElementSnapshot[]>();
  for (const el of textElements(snapshot)) {
    const k = styleKey(el);
    byKey.set(k, [...(byKey.get(k) ?? []), el]);
  }
  const groups = [...byKey.entries()].map(([key, elements]) => {
    const tagCount = new Map<string, number>();
    for (const e of elements) tagCount.set(e.tag, (tagCount.get(e.tag) ?? 0) + 1);
    // Most used first; on a tie, headings and body text win over labels, captions, code and links
    const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || tagRank(a[0]) - tagRank(b[0]) || a[0].localeCompare(b[0])).map(([t]) => t);
    // The color shown with a style is the one most of its elements use
    const colors = new Map<string, { el: ElementSnapshot; n: number }>();
    for (const e of elements) {
      const c = colorKey(e.styles.color ?? '') ?? '';
      colors.set(c, { el: colors.get(c)?.el ?? e, n: (colors.get(c)?.n ?? 0) + 1 });
    }
    const colorEl = [...colors.values()].sort((a, b) => b.n - a.n)[0]!.el;
    const lead = elements.find(e => e.tag === tags[0]) ?? elements[0]!;
    const style = { ...textStyleOf(lead), color: textStyleOf(colorEl).color };
    return { key, elements, tags, style, lead, role: '' };
  });
  groups.sort((a, b) => size(b) - size(a) || b.elements.length - a.elements.length || a.key.localeCompare(b.key));

  // Base names from the elements each style is used on
  const bodyGroups = groups.filter(g => category(g.lead).category === 'body');
  const mainBody = [...bodyGroups].sort((a, b) => b.elements.length - a.elements.length)[0];
  const largestHeading = Math.max(0, ...groups.filter(g => category(g.lead).category === 'heading').map(size));
  for (const g of groups) {
    const c = category(g.lead);
    if (c.category === 'heading') g.role = `heading-${c.level}`;
    else if (c.category === 'body' && g === mainBody) g.role = 'body';
    else if (c.category === 'body' && mainBody) {
      const big = size(g) > size(mainBody);
      g.role = big && size(g) > largestHeading && size(g) >= 1.5 * size(mainBody) ? 'display' : big ? 'body-large' : size(g) < size(mainBody) ? 'body-small' : 'body';
    } else g.role = c.category;
  }
  // Several styles with one name: number them, largest first
  const seen = new Map<string, number>();
  for (const g of groups) {
    const n = (seen.get(g.role) ?? 0) + 1;
    seen.set(g.role, n);
    if (n > 1) g.role = `${g.role}-${n}`;
  }
  return groups.map(({ lead: _lead, ...g }) => g);
}

/** The typography system of the page (FR12). Null when the page has no visible text. */
export function typographySystem(snapshot: PageSnapshot, options: { captured?: string } = {}): TypographySystem | null {
  const groups = textGroups(snapshot);
  if (!groups.length) return null;
  const families = new Map<string, number>();
  const sizes = new Map<string, { n: number; tokens: Set<string> }>();
  for (const g of groups) {
    families.set(g.style.family.computed, (families.get(g.style.family.computed) ?? 0) + g.elements.length);
    for (const e of g.elements) {
      const s = e.styles['font-size'] ?? '';
      const entry = sizes.get(s) ?? { n: 0, tokens: new Set<string>() };
      entry.n++;
      const t = valueOf(e, 'font-size').token;
      entry.tokens.add(t ?? '');
      sizes.set(s, entry);
    }
  }
  return {
    meta: { name: 'typography', scope: 'system', type: 'typography', source: snapshot.url, captured: options.captured ?? today(), method: 'measured' },
    roles: groups.map(g => ({ role: g.role, style: g.style, count: g.elements.length, elements: g.tags })),
    families: [...families.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([family, count]) => ({ family, count })),
    scale: [...sizes.entries()]
      .sort((a, b) => (pxValue(b[0]) ?? 0) - (pxValue(a[0]) ?? 0))
      .map(([computed, { n, tokens }]) => {
        // A token is shown only when every use of the size goes through the same one
        const only = tokens.size === 1 ? [...tokens][0] : '';
        return { size: { computed, ...(only ? { token: only } : {}) }, count: n };
      })
  };
}

/** One text style (FR11): the picked element's style, named after its role on the page. */
export function textToken(snapshot: PageSnapshot, el: ElementSnapshot, options: { captured?: string } = {}): TextToken {
  const group = textGroups(snapshot).find(g => g.elements.some(e => e.id === el.id));
  const role = group?.role ?? el.tag;
  const contrast = contrastOf(snapshot, el);
  return {
    meta: { name: `text-${role}`, scope: 'token', type: 'text', source: snapshot.url, selector: el.selector, captured: options.captured ?? today(), method: 'measured' },
    style: textStyleOf(el),
    usedBy: { element: elementName(el.tag, el.role), selector: el.selector },
    accessibility: { contrast: contrast ? [contrast] : [] }
  };
}
