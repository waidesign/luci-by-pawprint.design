/**
 * Layout mode's engine. Planned changes are previewed on the real page through one stylesheet Luci
 * owns (each touched element gets a data-luci-layout id): React's DOM is never moved or rewritten,
 * so the app keeps working and "Reset" puts everything back. Sizes and spacing snap to the page's
 * spacing scale, and name the custom property that has the value. Step 1 changes existing elements;
 * step 2 inserts new parts: each is a placeholder Luci draws, its siblings shifted (translate) to
 * make room, and its parent grown when it stacks top to bottom.
 */
import { snapshotPage, spacingSystem } from '@luci-dev/capture';
import { LAYOUT_PROPERTIES, type LayoutChange, type Part } from '@luci-dev/format/feedback';

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
export const snapTo = (px: number, base: number, allowNegative = false) =>
  allowNegative ? Math.round(px / base) * base : Math.max(0, Math.round(px / base) * base);

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

/** Where a new part goes: before or after an element, or inside it at the start or the end. */
export type InsertPosition = 'before' | 'after' | 'start' | 'end';

/** A planned new part (step 2): drawn by Luci as a placeholder, never put into the page's DOM. */
export interface PlannedInsert {
  readonly id: number;
  what: Part;
  anchor: Element;
  position: InsertPosition;
  /** px as rendered, or "100%" (the full width of its parent). */
  width: string;
  height: string;
  label?: string;
  /** Moved across its parent's axis by a handle (the left handle keeps the right edge), px. */
  nudge?: { x: number; y: number };
}
type InsertState = Omit<PlannedInsert, 'id'>;

/** Where a placeholder is, relative to its parent's box when it was measured (so it scrolls with it). */
interface Placement { parent: Element; dx: number; dy: number; width: number; height: number }

type Step =
  | { kind: 'set'; el: Element; prop: LayoutProperty; before: string | null; after: string | null }
  | { kind: 'move'; parent: Element; before: Element[]; after: Element[] }
  | { kind: 'insert'; id: number; before: InsertState | null; after: InsertState | null }
  | { kind: 'batch'; steps: Step[] };

/** The element a new part's siblings belong to. */
export const insertParent = (anchor: Element, position: InsertPosition): Element | null =>
  position === 'start' || position === 'end' ? anchor : anchor.parentElement;

const depth = (el: Element) => { let n = 0; for (let p = el.parentElement; p; p = p.parentElement) n++; return n; };

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
  /** New parts, by id, in the order they were added. */
  private readonly added = new Map<number, InsertState>();
  private readonly placements = new Map<number, Placement>();
  /**
   * Edges kept in place while a handle resizes (the left handle keeps the right edge): where the
   * edge was, relative to the parent's box, when the drag started. CSS grows a box toward its
   * end side whatever sets the width, so the preview shifts it back to grow where it was dragged.
   */
  private readonly kept = new Map<Element, { x?: { keep: 'start' | 'end'; at: number }; y?: { keep: 'start' | 'end'; at: number } }>();
  private nextInsert = 1;
  private done: Step[] = [];
  private undone: Step[] = [];
  private batchDepth = 0;
  private currentBatch: Step[] | null = null;
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
    this.placements.clear();
    if (!shifted.length && !this.added.size && !this.kept.size) return;
    // Shifts are measured on the page as laid out (sizes, spacing and orders already planned) and
    // kept per element, so a move and an insert under the same parent add up
    const shift = new Map<Element, { x: number; y: number }>();
    const addShift = (el: Element, x: number, y: number) => {
      const s = shift.get(el) ?? { x: 0, y: 0 };
      shift.set(el, { x: s.x + x, y: s.y + y });
    };
    const rectOf = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = shift.get(el);
      return s ? new DOMRect(r.left + s.x, r.top + s.y, r.width, r.height) : r;
    };
    // A box resized by a handle grows on the side that was dragged: shift it so the other edge stays
    for (const [el, k] of this.kept) {
      if (!el.isConnected || !el.parentElement) continue;
      const r = el.getBoundingClientRect();
      const pr = el.parentElement.getBoundingClientRect();
      const dx = k.x ? k.x.at - (k.x.keep === 'start' ? r.left - pr.left : r.right - pr.left) : 0;
      const dy = k.y ? k.y.at - (k.y.keep === 'start' ? r.top - pr.top : r.bottom - pr.top) : 0;
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) addShift(el, Math.abs(dx) >= 0.5 ? dx : 0, Math.abs(dy) >= 0.5 ? dy : 0);
    }
    // A top-to-bottom stack: shift each child into its new place with `translate` (which leaves the
    // site's own transform alone)
    for (const { original, current } of shifted) {
      const rects = original.map(el => el.getBoundingClientRect());
      const top = new Map(original.map((el, i) => [el, rects[i]!.top]));
      const height = new Map(original.map((el, i) => [el, rects[i]!.height]));
      const spaceAfter = rects.map((r, i) => (i < rects.length - 1 ? rects[i + 1]!.top - r.bottom : 0));
      let y = rects[0]!.top;
      current.forEach((el, i) => {
        const dy = Math.round((y - top.get(el)!) * 100) / 100;
        if (dy) addShift(el, 0, dy);
        y += height.get(el)! + (spaceAfter[i] ?? 0);
      });
    }
    if (this.added.size) rules.push(...this.placeInserts(rules, rectOf, addShift));
    for (const [el, s] of shift) {
      const x = Math.round(s.x * 100) / 100;
      const y = Math.round(s.y * 100) / 100;
      if (x || y) rules.push(`[${LAYOUT_ATTRIBUTE}="${this.idOf(el)}"] { translate: ${x}px ${y}px !important; }`);
    }
    this.style.textContent = rules.join('\n');
  }

  /**
   * Place every new part: in its parent's planned order, along the axis the parent lays children
   * out (a row for flex rows and grids, else top to bottom), with the gap the siblings have. The
   * siblings after it shift by its size and the gap; a top-to-bottom parent grows by as much
   * (bottom padding), so what follows the parent moves down for real. Parents deepest in the page
   * go first, each grown before the next is measured. Returns the growth rules.
   */
  private placeInserts(rules: string[], rectOf: (el: Element) => DOMRect, addShift: (el: Element, x: number, y: number) => void): string[] {
    const win = this.doc.defaultView!;
    const groups = new Map<Element, { id: number; ins: InsertState; slot: number }[]>();
    for (const [id, ins] of this.added) {
      const parent = insertParent(ins.anchor, ins.position);
      if (!parent?.isConnected || !ins.anchor.isConnected) continue;
      const list = groups.get(parent) ?? [];
      list.push({ id, ins, slot: 0 });
      groups.set(parent, list);
    }
    const grown: string[] = [];
    for (const parent of [...groups.keys()].sort((a, b) => depth(b) - depth(a))) {
      const kids = this.order(parent).filter(k => k.isConnected);
      const list = groups.get(parent)!;
      for (const item of list) {
        const at = kids.indexOf(item.ins.anchor);
        item.slot = item.ins.position === 'start' ? 0
          : item.ins.position === 'end' || at === -1 ? kids.length
          : item.ins.position === 'before' ? at : at + 1;
      }
      list.sort((a, b) => a.slot - b.slot || a.id - b.id);
      const axis = reorderable(parent)?.axis ?? 'y';
      const cs = win.getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      const n = (v: string) => parseFloat(v) || 0;
      const content = {
        left: pr.left + n(cs.borderLeftWidth) + n(cs.paddingLeft),
        top: pr.top + n(cs.borderTopWidth) + n(cs.paddingTop),
        width: pr.width - n(cs.borderLeftWidth) - n(cs.borderRightWidth) - n(cs.paddingLeft) - n(cs.paddingRight)
      };
      const rects = kids.map(rectOf);
      const gap = reorderable(parent)
        ? n(axis === 'x' ? cs.columnGap : cs.rowGap)
        : rects.length >= 2 ? Math.max(0, rects[1]!.top - rects[0]!.bottom) : 0;
      let offset = 0;
      let li = 0;
      for (let i = 0; i <= kids.length; i++) {
        for (; li < list.length && list[li]!.slot === i; li++) {
          const { id, ins } = list[li]!;
          const width = ins.width === '100%' ? content.width : n(ins.width);
          const height = n(ins.height);
          const ref = rects[i];
          const last = rects[rects.length - 1];
          let left: number;
          let top: number;
          if (axis === 'y') {
            top = (ref ? ref.top : last ? last.bottom + gap : content.top) + offset;
            left = ins.width === '100%' ? content.left : (ref ?? last)?.left ?? content.left;
          } else {
            left = (ref ? ref.left : last ? last.right + gap : content.left) + offset;
            top = (ref ?? last)?.top ?? content.top;
          }
          this.placements.set(id, { parent, dx: left - pr.left, dy: top - pr.top, width, height });
          offset += (axis === 'y' ? height : width) + gap;
        }
        if (i < kids.length && offset) addShift(kids[i]!, axis === 'x' ? offset : 0, axis === 'y' ? offset : 0);
      }
      if (axis === 'y' && offset) {
        // Measured with the planned values, before this growth; the rule comes last, so it wins
        grown.push(`[${LAYOUT_ATTRIBUTE}="${this.idOf(parent)}"] { padding-bottom: ${Math.round((n(cs.paddingBottom) + offset) * 100) / 100}px !important; }`);
        this.style.textContent = [...rules, ...grown].join('\n');
      }
    }
    return grown;
  }

  /**
   * Before a handle drag: keep this edge where it is on screen while the size changes ("end" keeps
   * the right or bottom edge, for the left or top handle). Measured as the element shows now.
   */
  keepEdge(el: Element, axis: 'x' | 'y', keep: 'start' | 'end'): void {
    const parent = el.parentElement;
    if (!parent) return;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const at = axis === 'x' ? (keep === 'start' ? r.left : r.right) - pr.left : (keep === 'start' ? r.top : r.bottom) - pr.top;
    this.kept.set(el, { ...this.kept.get(el), [axis]: { keep, at } });
  }

  /** Measure again (the window changed size). */
  refresh(): void {
    this.render();
  }

  // ---- New parts (step 2) ---------------------------------------------------------------------

  /** Plan a new part. Returns its id. */
  insert(part: InsertState): number {
    const id = this.nextInsert++;
    const state = { ...part };
    this.added.set(id, state);
    this.done.push({ kind: 'insert', id, before: null, after: { ...state } });
    this.undone = [];
    this.render();
    return id;
  }

  /** Change a new part: where it goes, its size, what goes in it. */
  updateInsert(id: number, change: Partial<InsertState>): void {
    const before = this.added.get(id);
    if (!before) return;
    const after = { ...before, ...change };
    if (after.label !== undefined && !after.label.trim()) delete after.label;
    if ((Object.keys(after) as (keyof InsertState)[]).every(k => after[k] === before[k]) && (before.label === undefined) === (after.label === undefined)) return;
    this.added.set(id, after);
    if (this.currentBatch) {
      const existing = this.currentBatch.find(s => s.kind === 'insert' && s.id === id) as { kind: 'insert'; id: number; before: InsertState | null; after: InsertState | null } | undefined;
      if (existing) {
        existing.after = { ...after };
      } else {
        this.currentBatch.push({ kind: 'insert', id, before: { ...before }, after: { ...after } });
      }
    } else {
      this.done.push({ kind: 'insert', id, before: { ...before }, after: { ...after } });
      this.undone = [];
    }
    this.render();
  }

  /** Fill in what a part is (its component's file, found after it was placed), without an undo step. */
  describeInsert(id: number, what: Part): void {
    const ins = this.added.get(id);
    if (ins) ins.what = what;
    for (const step of [...this.done, ...this.undone]) {
      if (step.kind !== 'insert' || step.id !== id) continue;
      if (step.before) step.before.what = what;
      if (step.after) step.after.what = what;
    }
  }

  removeInsert(id: number): void {
    const before = this.added.get(id);
    if (!before) return;
    this.added.delete(id);
    this.done.push({ kind: 'insert', id, before: { ...before }, after: null });
    this.undone = [];
    this.render();
  }

  /** The planned new parts, in the order they were added. */
  inserts(): PlannedInsert[] {
    return [...this.added].map(([id, s]) => ({ id, ...s }));
  }

  getInsert(id: number): PlannedInsert | null {
    const s = this.added.get(id);
    return s ? { id, ...s } : null;
  }

  /** Where a new part's placeholder is on screen now, or null when it cannot be placed. */
  insertRect(id: number): DOMRect | null {
    const p = this.placements.get(id);
    if (!p?.parent.isConnected) return null;
    const r = p.parent.getBoundingClientRect();
    const n = this.added.get(id)?.nudge;
    return new DOMRect(r.left + p.dx + (n?.x ?? 0), r.top + p.dy + (n?.y ?? 0), p.width, p.height);
  }

  /** The axis a new part lays along under this parent: a row (flex row, grid) or top to bottom. */
  axisOf(parent: Element): 'x' | 'y' {
    return reorderable(parent)?.axis ?? 'y';
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
    if (this.currentBatch) {
      const existing = this.currentBatch.find(s => s.kind === 'set' && s.el === el && s.prop === prop) as { kind: 'set'; el: Element; prop: LayoutProperty; before: string | null; after: string | null } | undefined;
      if (existing) {
        existing.after = value;
      } else {
        this.currentBatch.push({ kind: 'set', el, prop, before, after: value });
      }
    } else {
      this.done.push({ kind: 'set', el, prop, before, after: value });
      this.undone = [];
    }
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

  startBatch(): void {
    if (this.batchDepth === 0) {
      this.currentBatch = [];
    }
    this.batchDepth++;
  }

  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth === 0 && this.currentBatch) {
      const b = this.currentBatch.filter(s => {
        if (s.kind === 'set') return s.before !== s.after;
        return true;
      });
      this.currentBatch = null;
      if (b.length === 1) {
        this.done.push(b[0]!);
        this.undone = [];
      } else if (b.length > 1) {
        this.done.push({ kind: 'batch', steps: b });
        this.undone = [];
      }
    }
  }

  batch(fn: () => void): void {
    this.startBatch();
    try {
      fn();
    } finally {
      this.endBatch();
    }
  }

  private replayStep(step: Step, forward: boolean) {
    if (step.kind === 'set') this.applySet(step.el, step.prop, forward ? step.after : step.before);
    else if (step.kind === 'insert') {
      const state = forward ? step.after : step.before;
      if (state) this.added.set(step.id, { ...state }); else this.added.delete(step.id);
    } else if (step.kind === 'move') {
      const entry = this.orders.get(step.parent);
      if (entry) entry.current = forward ? step.after : step.before;
    } else if (step.kind === 'batch') {
      const steps = forward ? step.steps : [...step.steps].reverse();
      for (const s of steps) this.replayStep(s, forward);
    }
  }

  private replay(step: Step, forward: boolean) {
    this.replayStep(step, forward);
    if (!forward) {
      this.kept.clear();
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
    this.added.clear();
    this.kept.clear();
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
      const isPxLength = LENGTH_PROPERTIES.has(prop) && /^-?\d*\.?\d+px$/.test(to.trim());
      const token = isPxLength ? scale.tokens.get(parseFloat(to)) : undefined;
      // Which side it grew on, when a handle kept the other edge in place
      const k = this.kept.get(el);
      const side = prop === 'width' && k?.x ? (k.x.keep === 'end' ? 'left' : 'right')
        : prop === 'height' && k?.y ? (k.y.keep === 'end' ? 'up' : 'down') : undefined;
      out.push({ op: 'set', property: prop, from, to, ...(token ? { token } : {}), ...(side ? { grow: side } : {}) });
    }
    // New parts placed next to it or inside it
    for (const ins of this.added.values()) {
      if (ins.anchor !== el) continue;
      out.push({ op: 'insert', what: ins.what, position: ins.position, width: ins.width, height: ins.height, ...(ins.label ? { label: ins.label } : {}) });
    }
    return out;
  }

  /** Elements with planned changes (their own, a move among their siblings, or a new part next to or in them). */
  changed(scale: PageScale): Element[] {
    const all = new Set<Element>([...this.values.keys(), ...this.moved, ...[...this.added.values()].map(i => i.anchor)]);
    return [...all].filter(el => el.isConnected && this.changes(el, scale).length);
  }
}
