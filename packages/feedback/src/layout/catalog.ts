/**
 * What Layout mode can insert (FR32 step 2): the app's own components found on the page (React
 * names from fibers, each with one on the page to copy), and generic blocks with a starting size.
 * Saved captures come from the project through `luci serve` (FeedbackBackend.listCaptures).
 */
import { isLuciUi } from '@luci/capture';
import type { LayoutBlock, Part } from '@luci/format/feedback';
import { componentName, fiberOf, isServerRecord, ownerOf, reactInfo } from '../react.js';

export interface PageComponent {
  name: string;
  /** How many are on the page now. */
  count: number;
  /** The first one, in page order. */
  example: Element;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const same = (a: any, b: any) => a === b || (a && a.alternate === b);

/** The nearest element above that React rendered. */
function parentWithFiber(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (fiberOf(p)) return p;
  return null;
}

/** Fibers of host nodes and roots: the parent chain stops at them. */
const HOST_TAGS = new Set([3, 4, 5, 6, 26, 27]);

/**
 * The components whose outermost element this is. In the browser's own components, the fibers
 * between the element and the host element above it (a component that renders another as its
 * root counts too; elements passed in as `children` have none). Server components have no fibers:
 * the owners between the element and the owner of the element around it.
 */
function rootOf(el: Element): { name: string; owner: unknown }[] {
  const fiber = fiberOf(el);
  if (!fiber) return [];
  const chain: unknown[] = [];
  for (let f = fiber.return, i = 0; f && !HOST_TAGS.has(f.tag) && i < 40; f = f.return, i++) chain.push(f);
  if (!chain.some(componentName) && isServerRecord(ownerOf(fiber))) {
    const around = parentWithFiber(el);
    const stop = around ? ownerOf(fiberOf(around)) : null;
    let reached = !stop;
    for (let o = ownerOf(fiber), i = 0; o && isServerRecord(o) && i < 40; o = ownerOf(o), i++) {
      if (stop && same(o, stop)) { reached = true; break; }
      chain.push(o);
    }
    if (!reached) return [];
  }
  // The project's own components only (library wrappers are left out of reactInfo's list)
  const own = new Set(reactInfo(el)?.components ?? []);
  return chain.flatMap(owner => {
    const name = componentName(owner);
    return name && own.has(name) ? [{ name, owner }] : [];
  });
}

/** The app's own components on the page, the most used first, then the smaller. Empty without React (or in a production build). */
export function pageComponents(doc: Document, limit = 5000): PageComponent[] {
  // Counted by instance: a component that renders a fragment has several outermost elements
  // Each instance with the area of all its outermost elements (the page's shell is the largest)
  const found = new Map<string, { example: Element; instances: { owner: unknown; area: number }[] }>();
  const all = doc.body?.querySelectorAll('*') ?? [];
  for (let i = 0; i < all.length && i < limit; i++) {
    const el = all[i]!;
    if (isLuciUi(el) || !fiberOf(el)) continue;
    const roots = rootOf(el);
    if (!roots.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    for (const { name, owner } of roots) {
      const seen = found.get(name);
      const one = seen?.instances.find(x => same(x.owner, owner));
      if (one) one.area += r.width * r.height;
      else if (seen) seen.instances.push({ owner, area: r.width * r.height });
      else found.set(name, { example: el, instances: [{ owner, area: r.width * r.height }] });
    }
  }
  // The most used first, then the smaller ones (parts before the page's shell)
  return [...found]
    .map(([name, f]) => ({ name, count: f.instances.length, example: f.example, area: f.instances[0]!.area }))
    .sort((a, b) => b.count - a.count || a.area - b.area)
    .map(({ area: _area, ...c }) => c);
}

/** A block's starting size: px, or "fill" for the full width of its parent. */
export const BLOCK_SIZES: Readonly<Record<LayoutBlock, { width: number | 'fill'; height: number }>> = {
  section: { width: 'fill', height: 320 },
  heading: { width: 'fill', height: 48 },
  text: { width: 'fill', height: 96 },
  button: { width: 160, height: 44 },
  'image slot': { width: 320, height: 180 },
  card: { width: 280, height: 240 },
  'card grid': { width: 'fill', height: 360 },
  navigation: { width: 'fill', height: 64 },
  footer: { width: 'fill', height: 160 },
  'form field': { width: 320, height: 72 }
};

/** Capture types with a size of their own; any other capture starts full width. */
const CAPTURE_SIZES: Readonly<Record<string, { width: number; height: number }>> = {
  button: { width: 160, height: 44 },
  link: { width: 120, height: 32 },
  input: { width: 320, height: 44 },
  card: { width: 280, height: 240 },
  badge: { width: 80, height: 24 }
};

/**
 * Where a new part starts: its size (snapped to the page's base unit) given what it is and the
 * axis its new parent lays children along. Full width only works in a top-to-bottom stack.
 */
export function startSize(what: Part, axis: 'x' | 'y', base: number, example?: Element, captureType?: string): { width: string; height: string } {
  const snap = (n: number) => `${Math.max(base, Math.round(n / base) * base)}px`;
  let size: { width: number | 'fill'; height: number };
  if (what.kind === 'component' && example) {
    const r = example.getBoundingClientRect();
    size = { width: r.width, height: r.height };
  } else if (what.kind === 'block') {
    size = BLOCK_SIZES[what.name as LayoutBlock] ?? { width: 'fill', height: 160 };
  } else {
    size = CAPTURE_SIZES[captureType ?? ''] ?? { width: 'fill', height: 200 };
  }
  const width = size.width === 'fill' ? (axis === 'y' ? '100%' : snap(240)) : snap(size.width);
  return { width, height: snap(size.height) };
}
