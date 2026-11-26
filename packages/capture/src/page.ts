/**
 * The full-page reference: the page's typography, color and spacing systems, plus one entry per kind
 * of component on it (buttons, links, fields, cards...), each with its variants and states.
 */
import { colorSystemSchema, componentSchema, pageSectionSchema, spacingSystemSchema, toCaptureName, typographySystemSchema, type ComponentCapture, type PageCapture, type PageSection, type SiteStack } from '@luci-dev/format/capture';
import { colorSystem } from './color.js';
import { componentCapture, componentType, layoutStyles, pageWidthOf, variantGroups, type ComponentImageInput } from './component.js';
import { eligibility } from './eligibility.js';
import type { ElementSnapshot, PageSnapshot } from './model.js';
import { spacingSystem } from './spacing.js';
import { typographySystem } from './text.js';

const today = () => new Date().toISOString().slice(0, 10);

/** The kinds of component a page file describes. Headings, lists and plain boxes are covered by the systems. */
export const PAGE_COMPONENT_TYPES: ReadonlySet<string> = new Set(['button', 'link', 'field', 'navigation', 'header', 'footer', 'form', 'dialog', 'table', 'card', 'badge']);
/** At most this many component entries, so the file stays readable. */
export const MAX_PAGE_COMPONENTS = 16;
/** A "card" larger than this share of the page is a page wrapper with a background, not a card. */
export const MAX_CARD_SHARE = 0.5;

/** Components that describe their own parts: inside one, only reusable controls get an entry of their own (B-08). */
export const PAGE_COMPOSITES: ReadonlySet<string> = new Set(['table', 'header', 'footer', 'navigation', 'form', 'dialog']);
/** Controls that keep their own entry wherever they are: their variants and states matter on their own. */
const PAGE_PRIMITIVES: ReadonlySet<string> = new Set(['button', 'link', 'field']);

/**
 * One example of each kind of component, in page order: the first visible element of each type
 * (variantsOf then lists every look of it on the page). Inside a table, header, footer, navigation,
 * form or dialog only buttons, links and fields count: the rest is described by the composite (B-08).
 */
export function pageComponents(snap: PageSnapshot): ElementSnapshot[] {
  const body = snap.elements.find(e => e.tag === 'body');
  const pageArea = body ? body.rect.width * body.rect.height : Infinity;
  const width = pageWidthOf(snap);
  const byId = new Map(snap.elements.map(e => [e.id, e]));
  const types = new Map<number, string>();
  const typeOf = (e: ElementSnapshot) => {
    if (!types.has(e.id)) types.set(e.id, componentType(e, width));
    return types.get(e.id)!;
  };
  const inComposite = (el: ElementSnapshot) => {
    for (let p = el.parent; p !== undefined; p = byId.get(p)?.parent) {
      const up = byId.get(p);
      if (up && PAGE_COMPOSITES.has(typeOf(up))) return true;
    }
    return false;
  };

  const candidatesByType = new Map<string, ElementSnapshot[]>();
  const typeOrder: string[] = [];
  for (const el of snap.elements) {
    if (!el.visible || eligibility({ tag: el.tag }).status !== 'allowed') continue;
    const type = typeOf(el);
    if (!PAGE_COMPONENT_TYPES.has(type)) continue;
    if (type === 'card' && el.rect.width * el.rect.height > pageArea * MAX_CARD_SHARE) continue;
    if (!PAGE_PRIMITIVES.has(type) && inComposite(el)) continue;

    const list = candidatesByType.get(type) ?? [];
    list.push(el);
    candidatesByType.set(type, list);
    if (!typeOrder.includes(type)) typeOrder.push(type);
    if (el.tag === 'a' && type === 'button') {
      const linkList = candidatesByType.get('link') ?? [];
      linkList.push(el);
      candidatesByType.set('link', linkList);
      if (!typeOrder.includes('link')) typeOrder.push('link');
    }
  }

  const out: ElementSnapshot[] = [];
  for (const type of typeOrder) {
    if (out.length >= MAX_PAGE_COMPONENTS) break;
    const candidates = candidatesByType.get(type)!;
    const pool = (type === 'button' && candidates.some(c => c.tag === 'button' || c.role === 'button'))
      ? candidates.filter(c => c.tag === 'button' || c.role === 'button')
      : candidates;
    const groups = new Map<string, ElementSnapshot[]>();
    for (const c of pool) {
      const sig = `${c.tag}|${c.styles['background-color']}|${c.styles['color']}|${c.styles['font-size']}|${c.styles['border-top-width']}`;
      const list = groups.get(sig) ?? [];
      list.push(c);
      groups.set(sig, list);
    }
    const sortedGroups = [...groups.values()].sort((a, b) => b.length - a.length);
    const largestGroup = sortedGroups[0]!;
    const hasText = (e: ElementSnapshot) => e.hasText || snap.elements.some(child => child.parent === e.id && child.visible && child.hasText);
    const chosen = (type === 'link' || type === 'button')
      ? (largestGroup.find(hasText) ?? largestGroup[0]!)
      : largestGroup[0]!;
    out.push(chosen);
  }
  return out;
}

/** The page's name from its path: "/pricing/" -> "pricing", "/" -> "home". */
export function pageName(url: string): string {
  let path = '';
  try { path = new URL(url).pathname; } catch { /* not a URL */ }
  const trimmed = path.replace(/\/(index\.html?)?$/, '').replace(/^\//, '');
  return trimmed ? toCaptureName(trimmed) : 'home';
}

export interface PageComponentInput {
  entry: ElementSnapshot;
  /** How deep an element is inside this component (0 for itself, null outside). */
  inside: (el: ElementSnapshot) => number | null;
  states: ComponentCapture['states'];
  /** The images inside it, read from the live page. */
  images?: readonly ComponentImageInput[];
}

export type SkippedPart = NonNullable<PageCapture['skipped']>[number];

/** A short reason: a format check's first problem ("color.tokens.34.token: ..."), or the error's message. */
const reasonOf = (err: unknown): string => {
  const issues = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  const text = issues?.length ? `${issues[0]!.path.map(String).join('.')}: ${issues[0]!.message}` : err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, ' ').slice(0, 200);
};

/** At most this many sections in the page outline, so pathological pages stay readable. */
export const MAX_PAGE_SECTIONS = 24;

const SECTION_LANDMARKS = new Set(['header', 'footer', 'nav', 'aside']);
const SECTION_CONTAINERS = new Set(['section', 'article']);
const STRUCTURAL_LANDMARKS = new Set(['header', 'footer', 'main', 'section', 'article']);
const NON_BAND_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'img', 'picture', 'video', 'canvas',
  'a', 'button', 'input', 'select', 'textarea', 'form', 'table',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'span', 'strong', 'em', 'small', 'code', 'pre', 'label', 'dialog', 'hr', 'br', 'iframe'
]);
const DIRECT_CONTENT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'ul', 'ol', 'form', 'table']);
const AUTO_ID_RE = /^(__next|root|app|radix-|headlessui-|mui-|r\d+$|:[a-z0-9]+:)/i;
const SECTION_STYLE_PROPS = new Set([
  'display', 'flex-direction', 'grid-template-columns', 'align-items', 'justify-content',
  'row-gap', 'column-gap', 'padding', 'max-width', 'background-color', 'background-image',
  'border', 'border-top', 'border-bottom'
]);

/** Meaningful #id on the element's own last selector segment, ignoring framework auto-IDs. */
function ownIdOf(selector: string): string | null {
  const leaf = selector.split(' > ').pop() ?? selector;
  const m = /#([A-Za-z][A-Za-z0-9_-]{1,30})$/.exec(leaf);
  if (!m || AUTO_ID_RE.test(m[1]!)) return null;
  return toCaptureName(m[1]!);
}

/**
 * Top-level visual sections of a page in vertical order, each naming the layout/surface traits
 * of the band and the component variants (from `captured`) that sit inside it.
 */
export function pageSections(
  snap: PageSnapshot,
  captured: readonly { entry: ElementSnapshot; capture: ComponentCapture }[]
): PageSection[] {
  const body = snap.elements.find(e => e.tag === 'body');
  if (!body) return [];
  const pageWidth = pageWidthOf(snap) ?? (body.rect.width || 1280);
  const byId = new Map(snap.elements.map(e => [e.id, e]));
  const children = new Map<number, ElementSnapshot[]>();
  for (const e of snap.elements) {
    if (e.parent !== undefined) {
      const list = children.get(e.parent);
      if (list) list.push(e); else children.set(e.parent, [e]);
    }
  }

  // Map every component instance on the page to its exact variant name
  const elToVariant = new Map<number, string>();
  for (const { entry, capture } of captured) {
    for (const group of variantGroups(snap, entry, capture.meta.name)) {
      for (const el of group.elements) {
        if (!elToVariant.has(el.id)) elToVariant.set(el.id, group.name);
      }
    }
  }

  const descendants = (rootId: number): ElementSnapshot[] => {
    const out: ElementSnapshot[] = [];
    const stack = [...(children.get(rootId) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      const kids = children.get(cur.id);
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
    }
    return out;
  };

  const hasContent = (el: ElementSnapshot) => {
    if (el.hasText || elToVariant.has(el.id)) return true;
    return descendants(el.id).some(d => d.visible && (d.hasText || elToVariant.has(d.id)));
  };

  const hasStructuralDescendant = (el: ElementSnapshot) =>
    descendants(el.id).some(d => d.visible && STRUCTURAL_LANDMARKS.has(d.tag) && d.rect.width >= pageWidth * 0.4 && d.rect.height >= 24);

  const isBandSized = (el: ElementSnapshot, minHeight = 24) =>
    el.visible && el.rect.width >= pageWidth * 0.4 && el.rect.height >= minHeight;

  const collectBands = (parentId: number, depth: number): ElementSnapshot[] => {
    const kids = (children.get(parentId) ?? []).filter(c => c.visible);
    const out: ElementSnapshot[] = [];
    for (const el of kids) {
      if (NON_BAND_TAGS.has(el.tag) || !isBandSized(el)) continue;

      if (SECTION_LANDMARKS.has(el.tag)) {
        out.push(el);
        continue;
      }

      if (SECTION_CONTAINERS.has(el.tag)) {
        const nestedSections = (children.get(el.id) ?? []).filter(c => isBandSized(c) && SECTION_CONTAINERS.has(c.tag));
        if (depth < 5 && nestedSections.length >= 2) out.push(...collectBands(el.id, depth + 1));
        else out.push(el);
        continue;
      }

      if (el.tag === 'main') {
        const mainKids = (children.get(el.id) ?? []).filter(c => c.visible);
        const hasDirectContent = el.hasText || mainKids.some(c => c.hasText && DIRECT_CONTENT_TAGS.has(c.tag));
        if (hasDirectContent) {
          out.push(el);
        } else {
          const sub = collectBands(el.id, depth + 1);
          out.push(...(sub.length ? sub : [el]));
        }
        continue;
      }

      // Custom elements at top level (e.g. <site-header>)
      if (el.tag.includes('-') && depth === 0) {
        out.push(el);
        continue;
      }

      if (el.tag === 'div') {
        if (depth < 6 && hasStructuralDescendant(el)) {
          out.push(...collectBands(el.id, depth + 1));
          continue;
        }
        const divKids = (children.get(el.id) ?? []).filter(c => c.visible);
        const bandKids = divKids.filter(c => !NON_BAND_TAGS.has(c.tag) && isBandSized(c, 48));
        const hasDirectContent = el.hasText || divKids.some(c => c.hasText && DIRECT_CONTENT_TAGS.has(c.tag));
        if (depth < 6 && !hasDirectContent && (divKids.length === 1 || (depth <= 2 && bandKids.length >= 2))) {
          const sub = collectBands(el.id, depth + 1);
          if (sub.length) { out.push(...sub); continue; }
        }
        if (isBandSized(el, 64)) out.push(el);
      }
    }
    return out;
  };

  let bands = collectBands(body.id, 0).filter(hasContent);
  if (!bands.length) return [];

  // Keep only non-overlapping bands (drop any band that wraps another kept band)
  const bandIds = new Set(bands.map(b => b.id));
  const wrapsAnother = (el: ElementSnapshot) => {
    for (const other of bands) {
      if (other.id === el.id) continue;
      for (let p = other.parent; p !== undefined; p = byId.get(p)?.parent) {
        if (p === el.id) return true;
      }
    }
    return false;
  };
  bands = bands.filter(b => bandIds.has(b.id) && !wrapsAnother(b));
  bands.sort((a, b) => a.rect.y - b.rect.y || a.id - b.id);
  bands = bands.slice(0, MAX_PAGE_SECTIONS);

  // Determine section names cleanly without leaking page copy
  let heroUsed = false;
  const rawNames = bands.map(el => {
    if (el.tag === 'header' || el.role === 'banner') return 'header';
    if (el.tag === 'footer' || el.role === 'contentinfo') return 'footer';
    if (el.tag === 'nav' || el.role === 'navigation') return 'navigation';
    if (el.tag === 'aside' || el.role === 'complementary') {
      return el.rect.width >= pageWidth * 0.5 ? (el.rect.height <= 120 ? 'announcement' : 'aside') : 'sidebar';
    }
    if (el.tag.includes('-')) return toCaptureName(el.tag);
    const id = ownIdOf(el.selector);
    if (id) return id;
    const hasH1 = !heroUsed && (el.tag === 'h1' || descendants(el.id).some(d => d.visible && d.tag === 'h1'));
    if (hasH1) { heroUsed = true; return 'hero'; }
    return 'section';
  });

  // Number anonymous "section" bands sequentially (starting at section-2 if hero is present, else section-1)
  const nameCounts = new Map<string, number>();
  let anonIdx = heroUsed ? 1 : 0;
  const finalNames = rawNames.map(base => {
    if (base === 'section') {
      anonIdx++;
      return `section-${anonIdx}`;
    }
    const n = (nameCounts.get(base) ?? 0) + 1;
    nameCounts.set(base, n);
    return n > 1 ? `${base}-${n}` : base;
  });

  return bands.map((el, i) => {
    const styles = layoutStyles(snap, el).filter(
      s => SECTION_STYLE_PROPS.has(s.property) && !(s.property === 'display' && s.value.computed === 'block')
    );

    // Collect component variant references inside this band, in DOM order
    const subIds = new Set<number>([el.id, ...descendants(el.id).map(d => d.id)]);
    const compCounts = new Map<string, number>();
    for (const e of snap.elements) {
      if (!subIds.has(e.id)) continue;
      const variant = elToVariant.get(e.id);
      if (variant) compCounts.set(variant, (compCounts.get(variant) ?? 0) + 1);
    }

    return {
      name: finalNames[i]!,
      tag: el.tag,
      selector: el.selector,
      styles,
      components: [...compCounts.entries()].map(([name, count]) => ({ name, count }))
    };
  });
}

/**
 * The full-page reference from a snapshot and the components found on it (with their states).
 * A part that cannot be read (one odd value on a real site) is left out and listed, never the whole file.
 */
export function pageCapture(snap: PageSnapshot, components: readonly PageComponentInput[], options: { captured?: string; skipped?: readonly SkippedPart[]; stack?: SiteStack } = {}): PageCapture {
  const captured = options.captured ?? today();
  const skipped: SkippedPart[] = [...(options.skipped ?? [])];
  const used = new Map<string, number>();
  const capturedPairs: { entry: ElementSnapshot; capture: ComponentCapture }[] = [];
  const entries = components.flatMap(({ entry, inside, states, images }) => {
    try {
      // Checked against the format here, so one part that does not fit is left out, not the whole file
      const c = componentSchema.parse(componentCapture(snap, entry, inside, { captured, system: true, states, ...(images ? { images } : {}) }));
      const n = (used.get(c.meta.name) ?? 0) + 1;
      used.set(c.meta.name, n);
      const finalComp = n > 1 ? { ...c, meta: { ...c.meta, name: `${c.meta.name}-${n}` } } : c;
      capturedPairs.push({ entry, capture: finalComp });
      return [finalComp];
    } catch (err) {
      skipped.push({ part: `component ${entry.selector}`, reason: reasonOf(err) });
      return [];
    }
  });
  let sections: PageSection[] | undefined;
  try {
    const rawSections = pageSections(snap, capturedPairs);
    if (rawSections.length) sections = rawSections.map(s => pageSectionSchema.parse(s));
  } catch (err) {
    skipped.push({ part: 'sections', reason: reasonOf(err) });
  }
  const system = <T>(part: string, read: () => T | null, schema: { parse(v: unknown): T }): T | null => {
    try {
      const value = read();
      return value === null ? null : schema.parse(value);
    } catch (err) {
      skipped.push({ part, reason: reasonOf(err) });
      return null;
    }
  };
  return {
    meta: { name: pageName(snap.url), scope: 'page', type: 'page', source: snap.url, captured, method: 'measured', ...(options.stack && Object.keys(options.stack).length ? { stack: options.stack } : {}) },
    typography: system('typography', () => typographySystem(snap, { captured }), typographySystemSchema),
    color: system('colors', () => colorSystem(snap, { captured }), colorSystemSchema),
    spacing: system('spacing', () => spacingSystem(snap, { captured }), spacingSystemSchema),
    ...(sections?.length ? { sections } : {}),
    components: entries,
    ...(skipped.length ? { skipped } : {})
  };
}
