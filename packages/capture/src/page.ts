/**
 * The full-page reference: the page's typography, color and spacing systems, plus one entry per kind
 * of component on it (buttons, links, fields, cards...), each with its variants and states.
 */
import { colorSystemSchema, componentSchema, spacingSystemSchema, toCaptureName, typographySystemSchema, type ComponentCapture, type PageCapture } from '@luci-dev/format/capture';
import { colorSystem } from './color.js';
import { componentCapture, componentType, type ComponentImageInput } from './component.js';
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

/**
 * One example of each kind of component, in page order: the first visible element of each tag and
 * type (variantsOf then lists every look of it on the page).
 */
export function pageComponents(snap: PageSnapshot): ElementSnapshot[] {
  const body = snap.elements.find(e => e.tag === 'body');
  const pageArea = body ? body.rect.width * body.rect.height : Infinity;
  const seen = new Set<string>();
  const out: ElementSnapshot[] = [];
  for (const el of snap.elements) {
    if (out.length >= MAX_PAGE_COMPONENTS) break;
    // A bare image is not a component: it is an image slot of the component around it (FR4)
    if (!el.visible || eligibility({ tag: el.tag }).status !== 'allowed') continue;
    const type = componentType(el);
    if (!PAGE_COMPONENT_TYPES.has(type)) continue;
    if (type === 'card' && el.rect.width * el.rect.height > pageArea * MAX_CARD_SHARE) continue;
    const key = `${el.tag}|${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
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

/**
 * The full-page reference from a snapshot and the components found on it (with their states).
 * A part that cannot be read (one odd value on a real site) is left out and listed, never the whole file.
 */
export function pageCapture(snap: PageSnapshot, components: readonly PageComponentInput[], options: { captured?: string; skipped?: readonly SkippedPart[] } = {}): PageCapture {
  const captured = options.captured ?? today();
  const skipped: SkippedPart[] = [...(options.skipped ?? [])];
  const used = new Map<string, number>();
  const entries = components.flatMap(({ entry, inside, states, images }) => {
    try {
      // Checked against the format here, so one part that does not fit is left out, not the whole file
      const c = componentSchema.parse(componentCapture(snap, entry, inside, { captured, system: true, states, ...(images ? { images } : {}) }));
      const n = (used.get(c.meta.name) ?? 0) + 1;
      used.set(c.meta.name, n);
      return [n > 1 ? { ...c, meta: { ...c.meta, name: `${c.meta.name}-${n}` } } : c];
    } catch (err) {
      skipped.push({ part: `component ${entry.selector}`, reason: reasonOf(err) });
      return [];
    }
  });
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
    meta: { name: pageName(snap.url), scope: 'page', type: 'page', source: snap.url, captured, method: 'measured' },
    typography: system('typography', () => typographySystem(snap, { captured }), typographySystemSchema),
    color: system('colors', () => colorSystem(snap, { captured }), colorSystemSchema),
    spacing: system('spacing', () => spacingSystem(snap, { captured }), spacingSystemSchema),
    components: entries,
    ...(skipped.length ? { skipped } : {})
  };
}
