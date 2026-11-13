/**
 * Layout mode's engine (step 1: existing elements). Planned changes are previewed on the real page
 * through one stylesheet Luci owns (each touched element gets a data-luci-layout id): React's DOM is
 * never moved or rewritten, so the app keeps working and "Reset" puts everything back. Sizes and
 * spacing snap to the page's spacing scale, and name the custom property that has the value.
 */
import { snapshotPage, spacingSystem } from '@luci/capture';
import { LAYOUT_PROPERTIES, type LayoutChange } from '@luci/format/feedback';

export type LayoutProperty = (typeof LAYOUT_PROPERTIES)[number];
export const LAYOUT_ATTRIBUTE = 'data-luci-layout';

/** The page's spacing: its base unit, and which custom property holds each px value. */
export interface PageScale {
  base: number;
  /** px -> token name ("--space-6"). */
  tokens: Map<number, string>;
}

const TOKEN_NAME = /space|spacing|gap|size|gutter|inset|pad/i;

/** Read the page's spacing scale (once, when Layout mode opens). Base unit 4 when the page has none. */
export function pageScale(doc: Document): PageScale {
  const tokens = new Map<number, string>();
  let base = 4;
  try {
    const snap = snapshotPage(doc);
    const system = spacingSystem(snap);
    if (system?.baseUnit && system.baseUnit.px >= 2 && system.baseUnit.share >= 0.5) base = system.baseUnit.px;
    const rootPx = parseFloat(doc.defaultView!.getComputedStyle(doc.documentElement).fontSize) || 16;
    // Spacing-like names first, so "--space-4" wins over "--radius-4" for the same value
    const entries = Object.entries(snap.customProperties).sort(([a], [b]) => Number(TOKEN_NAME.test(b)) - Number(TOKEN_NAME.test(a)));
    for (const [name, value] of entries) {
      const m = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
      if (!m) continue;
      const px = Math.round(Number(m[1]) * (m[2] === 'rem' ? rootPx : 1) * 100) / 100;
      if (px > 0 && !tokens.has(px)) tokens.set(px, name);
    }
  } catch { /* an unreadable page: base 4, no tokens */ }
  return { base, tokens };
}

/** A value snapped to the scale (never below 0). */
export const snapTo = (px: number, base: number) => Math.max(0, Math.round(px / base) * base);

/** Properties measured in px that snap to the scale and get − and + steps. */
export const LENGTH_PROPERTIES: ReadonlySet<LayoutProperty> = new Set<LayoutProperty>([
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding', 'gap', 'row-gap', 'column-gap'
]);

/** The element's current value of a property: width and height as rendered, the rest as computed. */
export function currentValue(el: Element, prop: LayoutProperty): string {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  if (prop === 'width') return `${Math.round(r.width * 100) / 100}px`;
  if (prop === 'height') return `${Math.round(r.height * 100) / 100}px`;
  if (prop === 'gap') return cs.columnGap === 'normal' ? '0px' : cs.columnGap;
  if (prop === 'padding') return cs.paddingTop;
  const v = cs.getPropertyValue(prop).trim() || '0px';
  // Min and max sizes are on-screen sizes too (border and padding included), like width and height
  if (SIZE_LIMITS.has(prop) && /^-?\d*\.?\d+px$/.test(v) && cs.boxSizing !== 'border-box') {
    const sides = prop.endsWith('width') ? ['left', 'right'] : ['top', 'bottom'];
    const extra = sides.reduce((n, s) => n + (parseFloat(cs.getPropertyValue(`padding-${s}`)) || 0) + (parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0), 0);
    const total = parseFloat(v) + extra;
    return parseFloat(v) === 0 ? v : `${Math.round(total * 100) / 100}px`;
  }
  return v;
}

/** Sizes measured as rendered (border and padding included); the preview sets them with border-box. */
export const RENDERED_SIZES: ReadonlySet<LayoutProperty> = new Set<LayoutProperty>(['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height']);
const SIZE_LIMITS: ReadonlySet<LayoutProperty> = new Set<LayoutProperty>(['min-width', 'max-width', 'min-height', 'max-height']);

/** How a move among an element's siblings can be shown: CSS order (flex, grid), shifting (a top-to-bottom stack), or not at all. */
export type MovePreview = 'order' | 'shift' | null;

/** Whether the element lays its children out in a row or column that `order` can rearrange. */
export function reorderable(parent: Element): { axis: 'x' | 'y' } | null {
  const cs = parent.ownerDocument.defaultView!.getComputedStyle(parent);
  if (/flex/.test(cs.display)) return { axis: cs.flexDirection.startsWith('column') ? 'y' : 'x' };
  if (/grid/.test(cs.display)) return { axis: cs.gridAutoFlow.startsWith('column') ? 'y' : 'x' };
  return null;
}

/**
 * How a move under this parent is previewed. A block parent whose children sit one below the other
 * (sections, cards in a column) is shown by shifting them into the new order.
 */
export function movePreview(parent: Element): MovePreview {
  if (reorderable(parent)) return 'order';
  const kids = layoutChildren(parent);
  if (kids.length < 2) return null;
  const rects = kids.map(k => k.getBoundingClientRect());
  return rects.every((r, i) => i === 0 || r.top >= rects[i - 1]!.bottom - 1) ? 'shift' : null;
}

/** The element children that take part in layout (visible, not Luci's). */
export function layoutChildren(parent: Element): Element[] {
  const win = parent.ownerDocument.defaultView!;
  return Array.from(parent.children).filter(c => {
    if (c.hasAttribute('data-luci-ui')) return false;
    const cs = win.getComputedStyle(c);
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return false;
    const r = c.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

const describe = (el: Element) => {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  return role ? `${tag} (${role})` : tag;
};

type Step =
  | { kind: 'set'; el: Element; prop: LayoutProperty; before: string | null; after: string | null }
  | { kind: 'move'; parent: Element; before: Element[]; after: Element[] };

/** The planned changes on a page, previewed live, with undo and redo. */
export class LayoutPreview {
  private readonly style: HTMLStyleElement;
  private readonly ids = new Map<Element, string>();
  private readonly values = new Map<Element, Map<LayoutProperty, string>>();
  /** What each touched element looked like before any change. */
  private readonly original = new Map<Element, Map<LayoutProperty, string>>();
  /** Each reordered parent's children: as they were, and as planned. */
  private readonly orders = new Map<Element, { original: Element[]; current: Element[] }>();
  /** Elements the person moved (their siblings shift too, but only these get a move step). */
  private readonly moved = new Set<Element>();
  private done: Step[] = [];
  private undone: Step[] = [];
  private next = 1;

  constructor(private readonly doc: Document, readonly selectorFor: (el: Element) => string) {
    this.style = doc.createElement('style');
    this.style.setAttribute('data-luci-ui', '');
    this.style.setAttribute('data-part', 'layout-preview');
    doc.head.appendChild(this.style);
  }

  private idOf(el: Element): string {
    let id = this.ids.get(el);
    if (!id) {
      id = String(this.next++);
      this.ids.set(el, id);
      el.setAttribute(LAYOUT_ATTRIBUTE, id);
    }
    return id;
  }

  private render(): void {
    const rules: string[] = [];
    for (const [el, props] of this.values) {
      // Width and height are the size as rendered (border and padding included), like Luci measures them
      const sized = [...props.keys()].some(p => RENDERED_SIZES.has(p));
      const decl = [...props].map(([p, v]) => `${p}: ${v} !important;`).join(' ') + (sized ? ' box-sizing: border-box !important;' : '');
      if (decl) rules.push(`[${LAYOUT_ATTRIBUTE}="${this.idOf(el)}"] { ${decl} }`);
    }
    const shifted: { original: Element[]; current: Element[] }[] = [];
    for (const [parent, entry] of this.orders) {
      if (reorderable(parent)) entry.current.forEach((el, i) => rules.push(`[${LAYOUT_ATTRIBUTE}="${this.idOf(el)}"] { order: ${i} !important; }`));
      else shifted.push(entry);
    }
    this.style.textContent = rules.join('\n');
    if (!shifted.length) return;
    // A top-to-bottom stack: measure where each child is now (sizes and spacing already planned),
    // then shift each into its new place with `translate` (which leaves the site's own transform alone)
    for (const { original, current } of shifted) {
      const rects = original.map(el => el.getBoundingClientRect());
      const top = new Map(original.map((el, i) => [el, rects[i]!.top]));
      const height = new Map(original.map((el, i) => [el, rects[i]!.height]));
      const spaceAfter = rects.map((r, i) => (i < rects.length - 1 ? rects[i + 1]!.top - r.bottom : 0));
      let y = rects[0]!.top;
      current.forEach((el, i) => {
        const dy = Math.round((y - top.get(el)!) * 100) / 100;
        if (dy) rules.push(`[${LAYOUT_ATTRIBUTE}="${this.idOf(el)}"] { translate: 0 ${dy}px !important; }`);
        y += height.get(el)! + (spaceAfter[i] ?? 0);
      });
    }
    this.style.textContent = rules.join('\n');
  }

  private applySet(el: Element, prop: LayoutProperty, value: string | null) {
    const props = this.values.get(el) ?? new Map<LayoutProperty, string>();
    if (value === null) props.delete(prop);
    else props.set(prop, value);
    if (props.size) this.values.set(el, props); else this.values.delete(el);
  }

  /** Set one property (a px value already snapped). */
  set(el: Element, prop: LayoutProperty, value: string): void {
    const orig = this.original.get(el) ?? new Map<LayoutProperty, string>();
    if (!orig.has(prop)) orig.set(prop, currentValue(el, prop));
    this.original.set(el, orig);
    const before = this.values.get(el)?.get(prop) ?? null;
    if (before === value) return;
    this.applySet(el, prop, value);
    this.done.push({ kind: 'set', el, prop, before, after: value });
    this.undone = [];
    this.render();
  }

  /** The value a property has now: planned, else the page's. */
  value(el: Element, prop: LayoutProperty): string {
    return this.values.get(el)?.get(prop) ?? currentValue(el, prop);
  }

  /**
   * Move an element to a new place among its siblings (0-based). Shown with `order` in a flex or
   * grid parent, by shifting in a top-to-bottom stack; otherwise planned only. Returns how it shows.
   */
  move(el: Element, toIndex: number): MovePreview {
    const parent = el.parentElement;
    if (!parent) return null;
    const kind = this.orders.has(parent) ? (reorderable(parent) ? 'order' : 'shift') : movePreview(parent);
    const entry = this.orders.get(parent) ?? { original: layoutChildren(parent), current: layoutChildren(parent) };
    const before = [...entry.current];
    const from = before.indexOf(el);
    if (from === -1) return null;
    const after = before.filter(c => c !== el);
    after.splice(Math.max(0, Math.min(toIndex, after.length)), 0, el);
    if (after.every((c, i) => c === before[i])) return kind;
    this.moved.add(el);
    this.orders.set(parent, { original: entry.original, current: after });
    this.done.push({ kind: 'move', parent, before, after });
    this.undone = [];
    this.render();
    return kind;
  }

  /** The planned order of a parent's children (as previewed), or the page's. */
  order(parent: Element): Element[] {
    return this.orders.get(parent)?.current ?? layoutChildren(parent);
  }

  /** Whether a move is planned for this parent's children. */
  reordered(parent: Element): boolean {
    return this.orders.has(parent);
  }

  /** How a move under this parent shows, also once one is previewed (its children then look out of order). */
  previewOf(parent: Element): MovePreview {
    if (this.orders.has(parent)) return reorderable(parent) ? 'order' : 'shift';
    return movePreview(parent);
  }

  private replay(step: Step, forward: boolean) {
    if (step.kind === 'set') this.applySet(step.el, step.prop, forward ? step.after : step.before);
    else {
      const entry = this.orders.get(step.parent);
      if (entry) entry.current = forward ? step.after : step.before;
    }
    this.render();
  }

  undo(): boolean {
    const step = this.done.pop();
    if (!step) return false;
    this.replay(step, false);
    this.undone.push(step);
    return true;
  }

  redo(): boolean {
    const step = this.undone.pop();
    if (!step) return false;
    this.replay(step, true);
    this.done.push(step);
    return true;
  }

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }

  /** Put the page back exactly as it was. */
  reset(): void {
    this.values.clear();
    this.orders.clear();
    this.original.clear();
    this.moved.clear();
    this.done = [];
    this.undone = [];
    for (const el of this.ids.keys()) el.removeAttribute(LAYOUT_ATTRIBUTE);
    this.ids.clear();
    this.render();
  }

  /** Leave the page as it was and remove the stylesheet. */
  destroy(): void {
    this.reset();
    this.style.remove();
  }

  /** The planned changes of one element, for a note. */
  changes(el: Element, scale: PageScale): LayoutChange[] {
    const out: LayoutChange[] = [];
    const parent = el.parentElement;
    const order = parent ? this.orders.get(parent) : undefined;
    if (order && this.moved.has(el)) {
      const from = order.original.indexOf(el);
      const to = order.current.indexOf(el);
      if (from !== -1 && to !== -1 && from !== to) {
        // Named by the neighbor it lands next to (selectors of the page as it is now)
        const next = order.current[to + 1];
        const prev = order.current[to - 1];
        const neighbor = next ?? prev;
        out.push({
          op: 'move',
          position: next ? 'before' : prev ? 'after' : 'first',
          ...(neighbor ? { sibling: { selector: this.selectorFor(neighbor), element: describe(neighbor) } } : {}),
          from: from + 1,
          to: to + 1,
          of: order.current.length
        });
      }
    }
    const orig = this.original.get(el);
    for (const [prop, to] of this.values.get(el) ?? []) {
      const from = orig?.get(prop) ?? currentValue(el, prop);
      if (from === to) continue;
      const token = scale.tokens.get(parseFloat(to));
      out.push({ op: 'set', property: prop, from, to, ...(token ? { token } : {}) });
    }
    return out;
  }

  /** Elements with planned changes (their own, or a move among their siblings). */
  changed(scale: PageScale): Element[] {
    const all = new Set<Element>([...this.values.keys(), ...this.moved]);
    return [...all].filter(el => el.isConnected && this.changes(el, scale).length);
  }
}
