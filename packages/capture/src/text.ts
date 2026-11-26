/**
 * The Text tool (FR11, FR12): one text style, and the page's typography system. Every distinct
 * text style appears once, grouped into a role named from the elements that use it.
 */
import { colorKey, pxValue, type TextStyle, type TextToken, type TypographySystem } from '@luci-dev/format/capture';
import { contrastOf } from './a11y.js';
import { valueOf, type ElementSnapshot, type PageSnapshot } from './model.js';
import { elementName } from './naming.js';
import { identifyFont } from './font.js';

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
  const rawFamily = el.styles['font-family'];
  const font = rawFamily ? identifyFont(rawFamily) : undefined;
  return {
    family: valueOf(el, 'font-family'),
    size: valueOf(el, 'font-size'),
    weight: valueOf(el, 'font-weight'),
    lineHeight: valueOf(el, 'line-height'),
    letterSpacing: valueOf(el, 'letter-spacing'),
    color: valueOf(el, 'color'),
    ...(font ? { font } : {}),
    ...(style ? { style } : {}),
    ...(transform ? { transform } : {}),
    ...(decoration ? { decoration } : {})
  };
}

/**
 * Two elements share a text style when these match (color is part of the color system, not the
 * style). Line height and letter spacing are not part of it: utility classes vary them slightly from
 * element to element, which split one role into many; a role shows the values most of its text uses (B-06).
 */
export const styleKey = (el: ElementSnapshot) =>
  ['font-family', 'font-size', 'font-weight', 'font-style', 'text-transform'].map(p => el.styles[p as 'font-size'] ?? '').join('|');

/** Inline wrappers that carry no meaning of their own: their text belongs to the element around them. */
const INLINE_WRAPPERS = new Set(['span', 'strong', 'em', 'b', 'i', 'u', 'mark', 'abbr', 'q', 's', 'ins', 'del', 'bdi', 'bdo', 'font']);
/** At or below this size, body text is a caption (fine print, badges, legal lines). */
export const CAPTION_MAX_PX = 11;

/**
 * The element whose tag names an element's text: itself, or for an inline wrapper ("<h1><span>Hero
 * </span></h1>") the nearest ancestor with the same font size that is not a wrapper, when that
 * ancestor names text (a heading, button, link, label...) (B-06).
 */
function namingElement(byId: ReadonlyMap<number, ElementSnapshot>, el: ElementSnapshot): ElementSnapshot {
  // Layout wrappers pass too: "<h1><div class="flex flex-col"><span>..." (classicdecoder.com)
  const wrapper = (e: ElementSnapshot) => INLINE_WRAPPERS.has(e.tag) || e.tag === 'div';
  if (!wrapper(el)) return el;
  for (let cur = el, hops = 0; cur.parent !== undefined && hops < 6; hops++) {
    const up = byId.get(cur.parent);
    if (!up || up.styles['font-size'] !== el.styles['font-size']) return el;
    if (wrapper(up) && !up.hasText) { cur = up; continue; }
    return category(up).category === 'body' ? el : up;
  }
  return el;
}

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
  const byId = new Map(snapshot.elements.map(e => [e.id, e]));
  const naming = new Map<number, ElementSnapshot>();
  const byKey = new Map<string, ElementSnapshot[]>();
  for (const el of textElements(snapshot)) {
    naming.set(el.id, namingElement(byId, el));
    const k = styleKey(el);
    byKey.set(k, [...(byKey.get(k) ?? []), el]);
  }
  const nameOf = (e: ElementSnapshot) => naming.get(e.id) ?? e;
  /** The value most of the elements use, and one element that uses it. */
  const mostUsed = (elements: readonly ElementSnapshot[], value: (e: ElementSnapshot) => string) => {
    const counts = new Map<string, { el: ElementSnapshot; n: number }>();
    for (const e of elements) {
      const v = value(e);
      counts.set(v, { el: counts.get(v)?.el ?? e, n: (counts.get(v)?.n ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]!.el;
  };
  const groups = [...byKey.entries()].map(([key, elements]) => {
    const tagCount = new Map<string, number>();
    for (const e of elements) tagCount.set(nameOf(e).tag, (tagCount.get(nameOf(e).tag) ?? 0) + 1);
    // Most used first; on a tie, headings and body text win over labels, captions, code and links
    const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1] || tagRank(a[0]) - tagRank(b[0]) || a[0].localeCompare(b[0])).map(([t]) => t);
    // The color shown with a style is the one most of its elements use; so are line height and letter spacing
    const colorEl = mostUsed(elements, e => colorKey(e.styles.color ?? '') ?? '');
    const spacing = (e: ElementSnapshot) => `${e.styles['line-height'] ?? ''}|${e.styles['letter-spacing'] ?? ''}`;
    const spacingEl = mostUsed(elements, spacing);
    const lead = elements.find(e => nameOf(e).tag === tags[0] && spacing(e) === spacing(spacingEl)) ?? elements.find(e => nameOf(e).tag === tags[0]) ?? elements[0]!;
    const style = { ...textStyleOf(lead), lineHeight: textStyleOf(spacingEl).lineHeight, letterSpacing: textStyleOf(spacingEl).letterSpacing, color: textStyleOf(colorEl).color };
    return { key, elements, tags, style, lead: nameOf(lead), role: '' };
  });
  groups.sort((a, b) => size(b) - size(a) || b.elements.length - a.elements.length || a.key.localeCompare(b.key));

  // Base names from the elements each style is used on
  const bodyGroups = groups.filter(g => category(g.lead).category === 'body');
  const mainBody = [...bodyGroups].sort((a, b) => b.elements.length - a.elements.length)[0];
  const largestHeading = Math.max(0, ...groups.filter(g => category(g.lead).category === 'heading').map(size));

  // Determine distinct sizes descending per category
  const headingSizes: number[] = [];
  const bodyLargeSizes: number[] = [];
  const bodySmallSizes: number[] = [];
  const captionSizes: number[] = [];
  const otherSizes = new Map<string, number[]>();

  for (const g of groups) {
    const c = category(g.lead);
    const sz = size(g);
    if (c.category === 'heading') {
      if (!headingSizes.includes(sz)) headingSizes.push(sz);
    } else if (c.category === 'body') {
      if (sz > 0 && sz <= CAPTION_MAX_PX) {
        if (!captionSizes.includes(sz)) captionSizes.push(sz);
      } else if (mainBody && sz > size(mainBody)) {
        const isDisplay = sz > largestHeading && sz >= 1.5 * size(mainBody);
        if (!isDisplay && !bodyLargeSizes.includes(sz)) bodyLargeSizes.push(sz);
      } else if (mainBody && sz < size(mainBody)) {
        if (!bodySmallSizes.includes(sz)) bodySmallSizes.push(sz);
      }
    } else {
      const list = otherSizes.get(c.category) ?? [];
      if (!list.includes(sz)) list.push(sz);
      otherSizes.set(c.category, list);
    }
  }

  for (const g of groups) {
    const c = category(g.lead);
    const sz = size(g);
    if (c.category === 'heading') {
      const idx = headingSizes.indexOf(sz);
      g.role = `heading-${idx + 1}`;
    } else if (c.category === 'body' && sz > 0 && sz <= CAPTION_MAX_PX) {
      const idx = captionSizes.indexOf(sz);
      g.role = idx > 0 ? `caption-${idx + 1}` : 'caption';
    } else if (c.category === 'body' && g === mainBody) {
      g.role = 'body';
    } else if (c.category === 'body' && mainBody) {
      const big = sz > size(mainBody);
      const isDisplay = big && sz > largestHeading && sz >= 1.5 * size(mainBody);
      if (isDisplay) {
        g.role = 'display';
      } else if (big) {
        const idx = bodyLargeSizes.indexOf(sz);
        g.role = idx > 0 ? `body-large-${idx + 1}` : 'body-large';
      } else {
        const idx = bodySmallSizes.indexOf(sz);
        g.role = idx > 0 ? `body-small-${idx + 1}` : 'body-small';
      }
    } else {
      const list = otherSizes.get(c.category) ?? [];
      const idx = list.indexOf(sz);
      g.role = idx > 0 ? `${c.category}-${idx + 1}` : c.category;
    }
  }

  const WEIGHT_NAMES: Readonly<Record<string, string>> = {
    '100': 'thin',
    '200': 'extralight',
    '300': 'light',
    '400': 'regular',
    '500': 'medium',
    '600': 'semibold',
    '700': 'bold',
    '800': 'extrabold',
    '900': 'black',
    'normal': 'regular',
    'bold': 'bold'
  };

  const weightSuffix = (weight: string): string => {
    const n = parseInt(weight, 10);
    if (!isNaN(n)) {
      const rounded = Math.round(n / 100) * 100;
      return WEIGHT_NAMES[String(rounded)] ?? (n >= 600 ? 'bold' : 'regular');
    }
    return WEIGHT_NAMES[weight.toLowerCase()] ?? weight.toLowerCase();
  };

  // Group styles by (baseRole, size)
  const byBaseSize = new Map<string, TextGroup[]>();
  for (const g of groups) {
    const key = `${g.role}|${size(g)}`;
    byBaseSize.set(key, [...(byBaseSize.get(key) ?? []), g]);
  }

  const takenRoles = new Set<string>();
  const roleCounters = new Map<string, number>();

  for (const [, list] of byBaseSize) {
    const primary = list[0]!;
    takenRoles.add(primary.role);

    for (let i = 1; i < list.length; i++) {
      const g = list[i]!;
      const diffOnlyByWeight =
        g.style.family.computed === primary.style.family.computed &&
        (g.style.style?.computed ?? 'normal') === (primary.style.style?.computed ?? 'normal') &&
        (g.style.transform?.computed ?? 'none') === (primary.style.transform?.computed ?? 'none') &&
        (g.style.decoration?.computed ?? 'none') === (primary.style.decoration?.computed ?? 'none') &&
        g.style.lineHeight.computed === primary.style.lineHeight.computed &&
        g.style.letterSpacing.computed === primary.style.letterSpacing.computed &&
        g.style.weight.computed !== primary.style.weight.computed;

      const base = primary.role;
      let assigned = '';
      if (diffOnlyByWeight) {
        const candidate = `${base}-${weightSuffix(g.style.weight.computed)}`;
        if (!takenRoles.has(candidate)) {
          assigned = candidate;
        }
      }
      if (!assigned) {
        let num = roleCounters.get(base) ?? 2;
        while (takenRoles.has(`${base}-${num}`)) num++;
        assigned = `${base}-${num}`;
        roleCounters.set(base, num + 1);
      }
      g.role = assigned;
      takenRoles.add(assigned);
    }
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
    families: [...families.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([family, count]) => ({
      family,
      count
    })),
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
