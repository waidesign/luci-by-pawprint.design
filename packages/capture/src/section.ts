/**
 * Section scope (v0.2): a picked part of a page (a pricing section, a hero) becomes one section file
 * plus one component file per kind of component in it. The section file has the layout as an outline
 * and places each component by reference, so every component is described once. Pure: works on the
 * snapshot; states and images come in from the live page like the full-page reference.
 */
import { captureFileName, componentSchema, toCaptureName, type ComponentCapture, type SectionCapture } from '@luci/format/capture';
import { contrastOf } from './a11y.js';
import { componentCapture, componentType, layoutStyles, partName, textStylesOf, tokensOf, variantGroups, type ComponentImageInput } from './component.js';
import { eligibility } from './eligibility.js';
import { aspectRatioOf } from './image.js';
import type { ElementSnapshot, PageSnapshot } from './model.js';
import { elementName } from './naming.js';

const today = () => new Date().toISOString().slice(0, 10);

/** The kinds of component a section file places by reference; everything else is its layout and text. */
export const SECTION_COMPONENT_TYPES: ReadonlySet<string> = new Set(['button', 'field', 'card', 'badge', 'navigation', 'form', 'table', 'dialog']);
/** A "card" larger than this share of the section is a layout box with a background, not a card. */
export const MAX_SECTION_CARD_SHARE = 0.6;
/** The outline stops at this depth and this many lines, so the file stays readable. */
export const MAX_STRUCTURE_DEPTH = 8;
export const MAX_STRUCTURE_LINES = 80;

const SEMANTIC = new Set(['section', 'header', 'footer', 'main', 'aside', 'nav', 'form', 'article']);
const IMAGE_TAGS = new Set(['img', 'picture', 'video', 'canvas']);

/** One kind of component in the section: the first one (its file is captured from it) and every one in the section. */
export interface SectionGroup {
  example: ElementSnapshot;
  instances: ElementSnapshot[];
  /** For a button or field inside another component: the outer component of its first one. */
  within?: ElementSnapshot;
}

/** Kinds with states of their own: they get their own file even inside another component. */
const OWN_FILE_INSIDE: ReadonlySet<string> = new Set(['button', 'field']);

/** What the toolbar reads from the live page for one kind of component (as for the full-page reference). */
export interface SectionComponentInput {
  entry: ElementSnapshot;
  inside: (el: ElementSnapshot) => number | null;
  states: ComponentCapture['states'];
  images?: readonly ComponentImageInput[];
}

/** Children by parent, in page order. */
function childrenOf(snap: PageSnapshot): Map<number, ElementSnapshot[]> {
  const out = new Map<number, ElementSnapshot[]>();
  for (const e of snap.elements) if (e.parent !== undefined) out.set(e.parent, [...(out.get(e.parent) ?? []), e]);
  return out;
}

/**
 * The components in a section, grouped by kind (same tag and type): only the outermost ones (a
 * button inside a card is part of the card's file), and not a box that holds other cards (layout).
 */
export function sectionGroups(snap: PageSnapshot, section: ElementSnapshot, inside: (el: ElementSnapshot) => number | null): SectionGroup[] {
  const area = section.rect.width * section.rect.height;
  const candidates = snap.elements.filter(e => {
    const depth = inside(e);
    if (depth === null || depth < 1 || !e.visible || eligibility({ tag: e.tag }).status !== 'allowed') return false;
    const type = componentType(e);
    if (!SECTION_COMPONENT_TYPES.has(type)) return false;
    return type !== 'card' || e.rect.width * e.rect.height <= area * MAX_SECTION_CARD_SHARE;
  });
  const ids = new Set(candidates.map(c => c.id));
  const ancestors = (e: ElementSnapshot) => {
    const out: number[] = [];
    for (let p = e.parent; p !== undefined && p !== section.id; p = snap.elements[p]?.parent) out.push(p);
    return out;
  };
  // A card that holds other cards is a layout box
  const holders = new Set<number>();
  for (const c of candidates) if (componentType(c) === 'card') for (const a of ancestors(c)) if (ids.has(a) && componentType(snap.elements[a]!) === 'card') holders.add(a);
  const kept = candidates.filter(c => !holders.has(c.id));
  const keptIds = new Set(kept.map(k => k.id));
  // The outermost ones; inside another kept one, only buttons and fields (for their own states)
  const outerOf = (c: ElementSnapshot) => ancestors(c).reverse().find(a => keptIds.has(a));
  const groups = new Map<string, SectionGroup & { outers: (number | undefined)[] }>();
  for (const c of kept) {
    const outer = outerOf(c);
    const type = componentType(c);
    if (outer !== undefined && !OWN_FILE_INSIDE.has(type)) continue;
    const key = `${c.tag}|${type}`;
    const g = groups.get(key);
    if (g) { g.instances.push(c); g.outers.push(outer); } else groups.set(key, { example: c, instances: [c], outers: [outer] });
  }
  // "Inside" only when every one of them sits in another component; outer components come first
  return [...groups.values()]
    .map(({ outers, ...g }) => (outers.every(o => o !== undefined) ? { ...g, within: snap.elements[outers[0]!]! } : g))
    .sort((a, b) => Number(Boolean(a.within)) - Number(Boolean(b.within)));
}

/** The section's type: its tag when it says what it is (section, header, footer...), else "section". */
export const sectionType = (el: ElementSnapshot) => (SEMANTIC.has(el.tag) ? el.tag : 'section');
/** Its name: its id when the selector has one ("#pricing" -> "pricing"), else its type. */
export function sectionName(el: ElementSnapshot): string {
  const ids = [...el.selector.matchAll(/#([A-Za-z][\w-]*)/g)];
  const id = ids.length ? ids[ids.length - 1]![1]! : '';
  return toCaptureName(id || sectionType(el));
}

/** A layout box's part name from how it lays out its children. */
function boxPart(el: ElementSnapshot): string {
  const display = el.styles.display ?? '';
  if (/grid/.test(display)) return 'grid';
  if (/flex/.test(display)) return (el.styles['flex-direction'] ?? 'row').startsWith('column') ? 'column' : 'row';
  return 'group';
}

/**
 * The section file and its component files. `components` holds what was read from the live page for
 * each group's example, in the same order as `groups`.
 */
export function sectionCapture(
  snap: PageSnapshot,
  section: ElementSnapshot,
  inside: (el: ElementSnapshot) => number | null,
  groups: readonly SectionGroup[],
  components: readonly SectionComponentInput[],
  options: { captured?: string } = {}
): { section: SectionCapture; components: ComponentCapture[] } {
  const captured = options.captured ?? today();
  const within = (e: ElementSnapshot) => inside(e) !== null;
  // One component file per group, names made unique, variants counted inside the section only
  const used = new Map<string, number>();
  const files: ComponentCapture[] = [];
  const placed = new Map<number, { name: string; file: string; variant: string }>();
  groups.forEach((g, i) => {
    const input = components[i]!;
    const c = componentSchema.parse(componentCapture(snap, g.example, input.inside, { captured, system: true, states: input.states, within, ...(input.images ? { images: input.images } : {}) }));
    const n = (used.get(c.meta.name) ?? 0) + 1;
    used.set(c.meta.name, n);
    const name = n > 1 ? `${c.meta.name}-${n}` : c.meta.name;
    const file: ComponentCapture = n > 1 ? { ...c, meta: { ...c.meta, name }, variants: c.variants?.map((v, j) => ({ ...v, name: j === 0 ? name : `${name}-${j + 1}` })) } : c;
    files.push(file);
    const fileName = captureFileName(file.meta);
    for (const v of variantGroups(snap, g.example, name, within)) {
      for (const e of v.elements) if (g.instances.includes(e)) placed.set(e.id, { name, file: fileName, variant: v.name });
    }
  });

  // The outline: layout boxes with their own styles, text parts with their text style, image slots,
  // and components; boxes with no styles of their own are left out (their children move up a level)
  const kids = childrenOf(snap);
  const structure: SectionCapture['structure'] = [{ depth: 0, part: 'container', element: elementName(section.tag, section.role), styles: layoutStyles(snap, section) }];
  const texts: { part: string; el: ElementSnapshot }[] = [];
  const walk = (el: ElementSnapshot, depth: number) => {
    for (const child of kids.get(el.id) ?? []) {
      if (structure.length >= MAX_STRUCTURE_LINES) return;
      if (!child.visible) continue;
      const comp = placed.get(child.id);
      if (comp) {
        // Several of the same component next to each other: one line with a count
        const last = structure[structure.length - 1]!;
        if (last.component?.name === comp.name && last.depth === depth) {
          last.count = (last.count ?? 1) + 1;
          last.component.variants = [...(last.component.variants ?? [comp.name]), comp.variant];
        } else {
          structure.push({ depth, part: toCaptureName(componentType(child)), element: elementName(child.tag, child.role), styles: [], component: { name: comp.name, file: comp.file, variants: [comp.variant] } });
        }
        continue;
      }
      if (IMAGE_TAGS.has(child.tag)) {
        structure.push({ depth, part: 'image', element: elementName(child.tag, child.role), styles: [], image: { width: Math.round(child.rect.width * 100) / 100, height: Math.round(child.rect.height * 100) / 100, aspectRatio: aspectRatioOf(child.rect.width, child.rect.height) } });
        continue;
      }
      if (child.hasText) {
        const part = partName(child);
        structure.push({ depth, part, element: elementName(child.tag, child.role), styles: [...textStylesOf(child), ...layoutStyles(snap, child).filter(s => s.property !== 'display')] });
        texts.push({ part, el: child });
        continue;
      }
      const styles = layoutStyles(snap, child);
      if (styles.length && depth < MAX_STRUCTURE_DEPTH) {
        structure.push({ depth, part: boxPart(child), element: elementName(child.tag, child.role), styles });
        walk(child, depth + 1);
      } else {
        walk(child, depth);
      }
    }
  };
  if (section.hasText) texts.push({ part: 'container', el: section });
  walk(section, 1);
  // A variant list only when the components in a line are not all the same
  for (const n of structure) {
    const v = n.component?.variants;
    if (n.component && v && v.every(x => x === n.component!.name)) delete n.component.variants;
  }

  const contrast = texts.flatMap(t => { const c = contrastOf(snap, t.el, t.part); return c ? [c] : []; });
  const counts = new Map<string, number>();
  for (const p of placed.values()) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  // The component a "within" group sits in, by name
  const nameOf = (el: ElementSnapshot) => placed.get(el.id)?.name;
  return {
    section: {
      meta: { name: sectionName(section), scope: 'section', type: sectionType(section), source: snap.url, selector: section.selector, captured, method: 'measured' },
      tokens: tokensOf(snap, structure),
      structure,
      components: files.map((f, i) => {
        const inside = groups[i]!.within ? nameOf(groups[i]!.within!) : undefined;
        return { name: f.meta.name, type: f.meta.type, file: captureFileName(f.meta), count: counts.get(f.meta.name) ?? 1, variants: f.variants?.length ?? 1, ...(inside ? { inside } : {}) };
      }),
      accessibility: { contrast }
    },
    components: files
  };
}
