/**
 * Layout mode (FR32, changed 13 Nov 2026): try layout changes on the live page, then copy them as one
 * prompt for your agent. Select an element; drag any of its 8 handles to resize, ⠿ to move it among
 * its neighbors; set size (with min and max), margin and padding per side, the element as a flex or
 * grid container, and its place in a flex or grid parent. Values snap to the page's spacing scale and
 * name its token. Everything is previewed on the real page (LayoutPreview); copying the prompt (or
 * adding the plan to Feedback notes) puts the page back as it was.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Button, IconAdd, IconClose, IconCopy, IconNewPage, IconRedo, IconReset, IconSelect, IconUndo, Mascot, Select, useShortcuts } from '@luci/ui';

/** Layout's single-key shortcuts (in each tooltip); Undo and Redo keep Ctrl+Z and Ctrl+Shift+Z. */
export const LAYOUT_KEYS = { select: 'S', insert: 'I', newPage: 'N' } as const;
import { ButtonSpinner, Loading, LuciLogo, ModeSwitch, elementAt, isLuciUi, parentOf, scrollableAncestor, selectorFor, useUiPrefs, type ModeSwitchProps } from '@luci/capture';
import { formatLayoutPrompt, layoutChangeText, routeOf, type LayoutPromptElement, type Part } from '@luci/format/feedback';
import type { FeedbackBackend } from '../backend.js';
import { startSize } from '../layout/catalog.js';
import { LayoutPreview, insertParent, layoutChildren, pageScale, reorderable, snapTo, type InsertPosition, type LayoutProperty, type PageScale, type PlannedInsert } from '../layout/preview.js';
import { describeTarget, frameworkInfo, nameOf } from '../target.js';
import { copyToClipboard } from './clipboard.js';
import { EMPTY_SOURCES, PartPicker, componentFile, loadSources, namedPart, partName, type Chosen, type PartSources } from './parts.js';
import { Sketch } from './sketch.js';

export interface LayoutProps {
  doc: Document;
  backend: FeedbackBackend;
  modes?: ModeSwitchProps;
  connectNote?: string;
  onClose: () => void;
}

/** The 8 handles: sides and corners. */
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSOR: Readonly<Record<Edge, string>> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

type Drag =
  | { kind: 'resize'; edge: Edge; el: Element; x: number; y: number; w: number; h: number }
  | { kind: 'move'; el: Element; x: number; y: number }
  | { kind: 'insert-resize'; edge: Edge; id: number; x: number; y: number; w: number; h: number; full: boolean; nudge: { x: number; y: number }; axis: 'x' | 'y' }
  | { kind: 'insert-move'; id: number; x: number; y: number };

/** Where a new part would go for a point on the page, and what shows it. */
interface PlaceTarget {
  anchor: Element;
  position: InsertPosition;
  /** A line before or after the anchor, or the anchor's outline for "inside". */
  line?: { left: number; top: number; width: number; height: number };
  outline?: DOMRect;
}

/** Elements a part is never put inside (it goes before or after them). */
const LEAF = /^(img|input|textarea|select|button|a|svg|video|canvas|iframe|br|hr|p|h[1-6]|span|label|strong|em|b|i|small|code|picture|li)$/i;

const KIND_TEXT: Readonly<Record<Part['kind'], string>> = { component: 'Your component', capture: 'Saved capture', block: 'Block' };
const POSITION_TEXT: Readonly<Record<InsertPosition, string>> = { before: 'before', after: 'after', start: 'inside, at the start of', end: 'inside, at the end of' };

/**
 * Where a part goes for a point over an element: near its top or bottom edge (left or right in a
 * row), before or after it; over the middle of a container, inside it at the end.
 */
function placeTarget(doc: Document, el: Element, x: number, y: number): PlaceTarget | null {
  if (el === doc.documentElement) return null;
  const r = el.getBoundingClientRect();
  if (el === doc.body || !el.parentElement || el.parentElement === doc.documentElement) return { anchor: el, position: 'end', outline: r };
  const axis = reorderable(el.parentElement)?.axis ?? 'y';
  const t = axis === 'y' ? (y - r.top) / Math.max(1, r.height) : (x - r.left) / Math.max(1, r.width);
  const container = !LEAF.test(el.tagName);
  const position: InsertPosition = container ? (t < 0.25 ? 'before' : t > 0.75 ? 'after' : 'end') : t < 0.5 ? 'before' : 'after';
  if (position === 'end') return { anchor: el, position, outline: r };
  const edge = axis === 'y' ? (position === 'before' ? r.top : r.bottom) : (position === 'before' ? r.left : r.right);
  const line = axis === 'y' ? { left: r.left, top: edge - 2, width: r.width, height: 4 } : { left: edge - 2, top: r.top, width: 4, height: r.height };
  return { anchor: el, position, line };
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const DISPLAYS = ['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline-grid', 'inline'];
const DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse'];
const WRAPS = ['nowrap', 'wrap', 'wrap-reverse'];
const JUSTIFY = ['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'start', 'end', 'stretch'];
const ALIGN = ['normal', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'start', 'end'];
const ALIGN_SELF = ['auto', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline', 'start', 'end'];

const px = (v: string) => parseFloat(v) || 0;
const isPx = (v: string) => /^-?\d*\.?\d+px$/.test(v.trim());
const nameWithComponent = (el: Element) => {
  const c = frameworkInfo(el)?.components.at(-1);
  return `${nameOf(el)}${c ? ` · ${c}` : ''}`;
};
/** A typed value: a bare number is px; "none", "auto", "50%", "20rem" are kept as written. */
const typed = (raw: string): string | null => {
  const v = raw.trim();
  if (!v) return null;
  if (/^-?\d*\.?\d+$/.test(v)) return `${Math.round(Number(v) * 100) / 100}px`;
  return /^(-?\d*\.?\d+(px|rem|em|%|vw|vh|ch|fr)|none|auto|min-content|max-content|fit-content)$/.test(v) ? v : null;
};
/** "repeat(3, minmax(0, 1fr))" or "200px 200px 200px" -> 3; "none" -> 0. */
const columnCount = (v: string) => {
  const rep = /^repeat\((\d+)/.exec(v.trim());
  if (rep) return Number(rep[1]);
  return v.trim() === 'none' ? 0 : v.trim().split(/\s+(?![^(]*\))/).length;
};

/** Where a dragged element (or new part, `el` null) would land among the parent's children, and the line that shows it. */
function dropTarget(preview: LayoutPreview, parent: Element | null, el: Element | null, x: number, y: number): { index: number; line: { left: number; top: number; width: number; height: number } } | null {
  if (!parent) return null;
  const axis = reorderable(parent)?.axis ?? 'y';
  const others = preview.order(parent).filter(c => c !== el);
  if (!others.length) return null;
  const rects = others.map(c => c.getBoundingClientRect());
  const at = axis === 'x' ? x : y;
  let index = rects.filter(r => (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2) < at).length;
  index = Math.max(0, Math.min(index, others.length));
  const ref = rects[Math.min(index, rects.length - 1)]!;
  const edge = index < rects.length ? (axis === 'x' ? ref.left : ref.top) : (axis === 'x' ? ref.right : ref.bottom);
  const line = axis === 'x'
    ? { left: edge - 2, top: ref.top, width: 4, height: ref.height }
    : { left: ref.left, top: edge - 2, width: ref.width, height: 4 };
  return { index, line };
}

/** Where a handle sits on the selection box. */
function handleStyle(edge: Edge, b: DOMRect): Record<string, string> {
  const x = edge.includes('w') ? b.left : edge.includes('e') ? b.right : b.left + b.width / 2;
  const y = edge.includes('n') ? b.top : edge.includes('s') ? b.bottom : b.top + b.height / 2;
  const side = edge.length === 1;
  const w = side && (edge === 'e' || edge === 'w') ? 10 : side ? 24 : 14;
  const h = side && (edge === 'n' || edge === 's') ? 10 : side ? 24 : 14;
  return { left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px`, cursor: CURSOR[edge] };
}

export function Layout(props: LayoutProps) {
  const { doc, backend } = props;
  const win = doc.defaultView ?? window;
  const preview = useRef<LayoutPreview | null>(null);
  preview.current ??= new LayoutPreview(doc, el => selectorFor(el, el.getRootNode() as Document | ShadowRoot));
  const [scale, setScale] = useState<PageScale | null>(null);
  const [selecting, setSelecting] = useState(true);
  const [hovered, setHovered] = useState<Element | null>(null);
  const [selected, setSelected] = useState<Element | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<ReturnType<typeof dropTarget>>(null);
  const [linked, setLinked] = useState<{ margin: boolean; padding: boolean }>({ margin: false, padding: false });
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ prompt?: string; text: string; ok: boolean; why?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Step 2: inserting new parts
  const [catalog, setCatalog] = useState(false);
  const [sources, setSources] = useState<PartSources>(EMPTY_SOURCES);
  const [placing, setPlacing] = useState<Chosen | null>(null);
  const [placeHover, setPlaceHover] = useState<PlaceTarget | null>(null);
  const [insertSel, setInsertSel] = useState<number | null>(null);
  // Step 3: sketching a new page (over the app; the plan for this page stays as it is)
  const [sketching, setSketching] = useState(false);
  const [uiPrefs] = useUiPrefs(doc);
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  // The page's scale is read once (a snapshot of the page); the preview is undone on leaving
  useEffect(() => {
    const t = setTimeout(() => setScale(pageScale(doc)), 0);
    const onScroll = () => bump();
    // A new width lays the page out again: measure the placeholders again
    const onResize = () => { preview.current?.refresh(); bump(); };
    win.addEventListener('scroll', onScroll, true);
    win.addEventListener('resize', onResize);
    return () => {
      clearTimeout(t);
      win.removeEventListener('scroll', onScroll, true);
      win.removeEventListener('resize', onResize);
      preview.current?.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.composedPath()[0];
      if (sketching || (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Escape') {
        if (drag) setDrag(null);
        else if (placing || catalog) { setPlacing(null); setPlaceHover(null); setCatalog(false); }
        else if (insertSel !== null) { setInsertSel(null); setSelecting(true); }
        else if (selected) { setSelected(null); setSelecting(true); }
        else if (selecting) setSelecting(false);
        else return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && insertSel !== null) {
        preview.current!.removeInsert(insertSel);
        setInsertSel(null);
        setSelecting(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) preview.current!.redo(); else preview.current!.undo();
        bump();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [drag, selected, selecting, placing, catalog, insertSel, sketching]);

  const p = preview.current;
  const base = scale?.base ?? 4;
  const tokenFor = (v: string) => (isPx(v) ? scale?.tokens.get(px(v)) : undefined);

  // ---- Picking ---------------------------------------------------------------------------------
  const select = (el: Element | null) => {
    setSelected(el);
    setSelecting(!el);
    setHovered(null);
    setInsertSel(null);
  };
  const selectInsert = (id: number | null) => {
    setInsertSel(id);
    setSelected(null);
    setSelecting(id === null);
    setHovered(null);
    setCatalog(false);
    setPlacing(null);
    setResult(null);
  };

  // ---- Inserting new parts (step 2) -----------------------------------------------------------
  const openCatalog = () => {
    if (catalog || placing) { setCatalog(false); setPlacing(null); setPlaceHover(null); return; }
    setResult(null);
    setInsertSel(null);
    loadSources(doc, backend, setSources);
    setCatalog(true);
  };
  const choose = (c: Chosen) => {
    setCatalog(false);
    setPlacing(c);
    setHovered(null);
  };
  const placeAt = (anchor: Element, position: InsertPosition) => {
    if (!placing) return;
    const parent = insertParent(anchor, position);
    if (!parent) return;
    const named = namedPart(placing);
    const id = p.insert({ what: named, anchor, position, ...startSize(placing.what, p.axisOf(parent), base, placing.example, placing.captureType) });
    setPlacing(null);
    setPlaceHover(null);
    selectInsert(id);
    void componentFile(placing, backend).then(file => { if (file) { p.describeInsert(id, { ...named, file }); bump(); } });
  };
  const pickWheel = (e: WheelEvent) => {
    const box = scrollableAncestor(elementAt(doc, e.clientX, e.clientY), e.deltaX, e.deltaY);
    if (box) box.scrollBy(e.deltaX, e.deltaY); else win.scrollBy(e.deltaX, e.deltaY);
  };

  // ---- Dragging handles ------------------------------------------------------------------------
  const startDrag = (kind: 'move' | Edge) => (e: PointerEvent) => {
    if (!selected) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = selected.getBoundingClientRect();
    setResult(null);
    // The box grows on the side that is dragged: the left handle keeps the right edge, and so on
    if (kind !== 'move') {
      if (/[ew]/.test(kind)) p.keepEdge(selected, 'x', kind.includes('w') ? 'end' : 'start');
      if (/[ns]/.test(kind)) p.keepEdge(selected, 'y', kind.includes('n') ? 'end' : 'start');
    }
    setDrag(kind === 'move' ? { kind, el: selected, x: e.clientX, y: e.clientY } : { kind: 'resize', edge: kind, el: selected, x: e.clientX, y: e.clientY, w: r.width, h: r.height });
  };
  const startInsertDrag = (kind: 'move' | Edge) => (e: PointerEvent) => {
    const ins = insertSel !== null ? p.getInsert(insertSel) : null;
    const r = ins ? p.insertRect(ins.id) : null;
    if (!ins || !r) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setResult(null);
    setDrag(kind === 'move' ? { kind: 'insert-move', id: ins.id, x: e.clientX, y: e.clientY } : { kind: 'insert-resize', edge: kind, id: ins.id, x: e.clientX, y: e.clientY, w: r.width, h: r.height, full: ins.width === '100%', nudge: ins.nudge ?? { x: 0, y: 0 }, axis: p.axisOf(insertParent(ins.anchor, ins.position) ?? ins.anchor) });
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'move') { setDrop(dropTarget(p, drag.el.parentElement, drag.el, e.clientX, e.clientY)); return; }
    if (drag.kind === 'insert-move') {
      const ins = p.getInsert(drag.id);
      setDrop(ins ? dropTarget(p, insertParent(ins.anchor, ins.position), null, e.clientX, e.clientY) : null);
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.kind === 'insert-resize') {
      // A full-width part stays full width until a side handle sets a width
      const sideways = /[ew]/.test(drag.edge);
      const width = sideways ? `${Math.max(base, snapTo(drag.w + (drag.edge.includes('e') ? dx : -dx), base))}px` : drag.full ? '100%' : `${snapTo(drag.w, base)}px`;
      const height = /[ns]/.test(drag.edge) ? `${Math.max(base, snapTo(drag.h + (drag.edge.includes('s') ? dy : -dy), base))}px` : `${snapTo(drag.h, base)}px`;
      // Across the parent's axis it grows on the dragged side (the neighbors make room along it)
      const nudge = { ...drag.nudge };
      if (drag.axis === 'y' && drag.edge.includes('w')) nudge.x = drag.nudge.x - (parseFloat(width) - drag.w);
      if (drag.axis === 'x' && drag.edge.includes('n')) nudge.y = drag.nudge.y - (parseFloat(height) - drag.h);
      p.updateInsert(drag.id, { width, height, ...(nudge.x || nudge.y ? { nudge } : {}) });
      bump();
      return;
    }
    // Left and top handles grow the size too; where it grows on screen depends on the layout
    if (drag.edge.includes('e')) p.set(drag.el, 'width', `${snapTo(drag.w + dx, base)}px`);
    if (drag.edge.includes('w')) p.set(drag.el, 'width', `${snapTo(drag.w - dx, base)}px`);
    if (drag.edge.includes('s')) p.set(drag.el, 'height', `${snapTo(drag.h + dy, base)}px`);
    if (drag.edge.includes('n')) p.set(drag.el, 'height', `${snapTo(drag.h - dy, base)}px`);
    bump();
  };
  const endDrag = () => {
    if (drag?.kind === 'move' && drop) p.move(drag.el, drop.index);
    if (drag?.kind === 'insert-move' && drop) {
      const ins = p.getInsert(drag.id);
      const parent = ins ? insertParent(ins.anchor, ins.position) : null;
      if (ins && parent) {
        // Named by the neighbor it now goes before (or after the last one; inside an empty parent)
        const kids = p.order(parent);
        const at = kids[drop.index];
        const last = kids[kids.length - 1];
        p.updateInsert(ins.id, at ? { anchor: at, position: 'before' } : last ? { anchor: last, position: 'after' } : { anchor: parent, position: 'end' });
      }
    }
    setDrag(null);
    setDrop(null);
    bump();
  };

  // ---- The plan: copy it as a prompt, or add it to Feedback notes; either puts the page back ---
  const planned = scale ? p.changed(scale) : [];
  const plannedCount = planned.reduce((n, el) => n + p.changes(el, scale!).length, 0);
  const collect = async () => {
    const elements: (LayoutPromptElement & { el: Element; target: Awaited<ReturnType<typeof describeTarget>>['target'] })[] = [];
    let pageSource: string | undefined;
    for (const el of planned) {
      const { target, pageSource: ps } = await describeTarget(el, backend.resolveFrames ? { serverResolve: backend.resolveFrames } : {});
      pageSource ??= ps;
      elements.push({
        el, target, element: target.element, selector: target.selector,
        ...(target.text ? { text: target.text } : {}),
        ...(target.components ? { components: target.components } : {}),
        ...(target.source ? { source: target.source } : {}),
        changes: p.changes(el, scale!)
      });
    }
    return { elements, pageSource };
  };
  /** Why the page goes back after a copy: Layout mode previews, the code has not changed yet. */
  const finish = (text: string, prompt?: string) => {
    p.reset();
    setSelected(null);
    setInsertSel(null);
    setPlacing(null);
    setSelecting(true);
    setNote('');
    setResult({ ok: true, why: true, text, ...(prompt ? { prompt } : {}) });
    bump();
  };
  const copyPrompt = async () => {
    if (!planned.length) return;
    setBusy('copy');
    try {
      const { elements, pageSource } = await collect();
      const prompt = formatLayoutPrompt({ route: routeOf(doc.location.href), ...(pageSource ? { pageSource } : {}), viewport: { width: win.innerWidth, height: win.innerHeight }, ...(note.trim() ? { note } : {}), elements });
      const copied = await copyToClipboard(doc, prompt);
      finish(copied ? 'Copied. Paste it to your agent. The page is back as it is in your code.' : 'Copy it from below and paste it to your agent. The page is back as it is in your code.', prompt);
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };
  const addToNotes = async () => {
    if (!planned.length) return;
    setBusy('notes');
    try {
      const { elements, pageSource } = await collect();
      const refs: string[] = [];
      for (const e of elements) {
        const item = await backend.add({
          page: { url: doc.location.href, title: doc.title, ...(pageSource ? { source: pageSource } : {}) },
          target: e.target,
          comment: note.trim() || `Layout: ${e.changes.map(layoutChangeText).join('; ')}`,
          intent: 'change',
          priority: 'medium',
          layout: { viewport: { width: win.innerWidth, height: win.innerHeight }, changes: [...e.changes] }
        });
        refs.push(item.ref);
      }
      finish(`Added ${refs.join(', ')} to Feedback notes. They go in the next Copy prompt there. The page is back as it is in your code.`);
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  // ---- Controls --------------------------------------------------------------------------------
  const setValue = (el: Element, prop: LayoutProperty, value: string) => { setResult(null); p.set(el, prop, value); bump(); };
  const lengthInput = (el: Element, prop: LayoutProperty, opts: { label?: string; group?: 'margin' | 'padding' } = {}) => {
    const v = p.value(el, prop);
    const token = tokenFor(v);
    const apply = (value: string) => {
      if (opts.group && linked[opts.group]) for (const s of SIDES) setValue(el, `${opts.group}-${s}` as LayoutProperty, value);
      else setValue(el, prop, value);
    };
    const step = (d: number) => apply(`${snapTo(px(v) + d * base, base)}px`);
    return (
      <div class={opts.group ? 'side' : 'lrow'} data-prop={prop} key={prop}>
        {opts.label && <span class="lname">{opts.label}</span>}
        <button type="button" data-step="-" aria-label={`Smaller ${opts.label ?? prop}`} onClick={() => step(-1)}>−</button>
        <input type="text" class="field" data-part={`value-${prop}`} value={isPx(v) ? String(Math.round(px(v) * 100) / 100) : v} title="A number is px; you can also type none, auto, 50%, 20rem"
          onChange={e => { const t = typed((e.currentTarget as HTMLInputElement).value); if (t) apply(t); else bump(); }} />
        <button type="button" data-step="+" aria-label={`Larger ${opts.label ?? prop}`} onClick={() => step(1)}>+</button>
        {!opts.group && <span class="token dim" data-part={`token-${prop}`}>{token ?? (isPx(v) ? 'px' : '')}</span>}
      </div>
    );
  };
  const sides = (el: Element, group: 'margin' | 'padding') => (
    <div class="sides" data-group={group}>
      <div class="sides-head">
        <span class="lname">{group === 'margin' ? 'Margin' : 'Padding'}</span>
        <button type="button" class="link-toggle" data-action={`link-${group}`} aria-pressed={linked[group]} title="Change all four sides together"
          onClick={() => setLinked(l => ({ ...l, [group]: !l[group] }))}>🔗 {linked[group] ? 'All sides' : 'Each side'}</button>
      </div>
      <div class="sides-grid">
        {SIDES.map(s => (
          <label class="side-cell"><span class="dim">{s}</span>{lengthInput(el, `${group}-${s}` as LayoutProperty, { group })}</label>
        ))}
      </div>
    </div>
  );
  const selectRow = (el: Element, label: string, prop: LayoutProperty, options: readonly string[]) => {
    const v = p.value(el, prop);
    return (
      <label class="lrow" data-prop={prop} key={prop}>
        <span class="lname">{label}</span>
        <Select data-part={`value-${prop}`} value={v} onChange={e => setValue(el, prop, (e.currentTarget as HTMLSelectElement).value)}>
          {(options.includes(v) ? options : [v, ...options]).map(o => <option value={o}>{o}</option>)}
        </Select>
      </label>
    );
  };
  const numberRow = (el: Element, label: string, prop: LayoutProperty) => {
    const v = p.value(el, prop);
    return (
      <label class="lrow" data-prop={prop} key={prop}>
        <span class="lname">{label}</span>
        <button type="button" data-step="-" onClick={() => setValue(el, prop, String(Math.max(0, Number(v) - 1)))}>−</button>
        <input type="number" class="field" data-part={`value-${prop}`} min={0} value={Number(v) || 0} onChange={e => setValue(el, prop, String(Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0)))} />
        <button type="button" data-step="+" onClick={() => setValue(el, prop, String(Number(v) + 1))}>+</button>
      </label>
    );
  };

  // ---- Views for new parts --------------------------------------------------------------------
  const selIns = insertSel !== null ? p.getInsert(insertSel) : null;
  const insBox = selIns ? p.insertRect(selIns.id) : null;
  /** Before, After, and Inside for a container. */
  const placeButtons = (anchor: Element, onPlace: (position: InsertPosition) => void, current?: InsertPosition) => (
    <div class="row" data-part="place-buttons">
      {(['before', 'after', ...(LEAF.test(anchor.tagName) ? [] : ['start', 'end'])] as InsertPosition[]).map(pos => (
        <button type="button" data-place={pos} aria-pressed={current === pos} onClick={() => onPlace(pos)}>
          {{ before: 'Before', after: 'After', start: 'Inside, start', end: 'Inside, end' }[pos]}
        </button>
      ))}
    </div>
  );
  const catalogView = () => (
    <div class="stack" data-part="insert-catalog">
      <h2>Insert</h2>
      <p class="dim">Pick what to add. Then click where it goes.</p>
      <PartPicker sources={sources} onChoose={choose} />
    </div>
  );
  const placingView = (pl: Chosen) => (
    <div class="stack" data-part="placing">
      <h2>Place: {partName(pl.what)}</h2>
      <div class="luci-hint" data-part="placing-hint">
        <Mascot pose="place" size={96} />
        <p class="hint">Click where it goes. Near an edge: before or after. The middle of a card or list: inside, at the end. Esc cancels.</p>
      </div>
      {selected && (
        <div class="stack">
          <span>Or next to {nameWithComponent(selected)}:</span>
          {placeButtons(selected, pos => placeAt(selected, pos))}
        </div>
      )}
      <div class="row"><button type="button" data-action="cancel-insert" onClick={() => { setPlacing(null); setPlaceHover(null); }}>Cancel</button></div>
    </div>
  );
  const insertSizeRow = (ins: PlannedInsert, dim: 'width' | 'height', label: string) => {
    const full = ins[dim] === '100%';
    const shown = full ? Math.round(insBox?.width ?? 0) : px(ins[dim]);
    const apply = (value: string) => { setResult(null); p.updateInsert(ins.id, { [dim]: value }); bump(); };
    const stack = p.axisOf(insertParent(ins.anchor, ins.position) ?? ins.anchor) === 'y';
    return (
      <div class="lrow" data-prop={`insert-${dim}`}>
        <span class="lname">{label}</span>
        <button type="button" data-step="-" aria-label={`Smaller ${label}`} onClick={() => apply(`${Math.max(base, snapTo(shown - base, base))}px`)}>−</button>
        <input type="text" class="field" data-part={`value-insert-${dim}`} value={full ? 'full' : String(shown)} title="A number is px; full is the full width"
          onChange={e => {
            const raw = (e.currentTarget as HTMLInputElement).value.trim();
            if (dim === 'width' && /^full$/i.test(raw)) apply('100%');
            else if (Number(raw) > 0) apply(`${Math.max(base, snapTo(Number(raw), base))}px`);
            else bump();
          }} />
        <button type="button" data-step="+" aria-label={`Larger ${label}`} onClick={() => apply(`${snapTo(shown + base, base)}px`)}>+</button>
        {dim === 'width' && stack
          ? <button type="button" class="link-toggle" data-action="insert-full-width" aria-pressed={full} onClick={() => apply(full ? `${snapTo(shown, base)}px` : '100%')}>Full width</button>
          : <span class="token dim">px</span>}
      </div>
    );
  };
  const insertView = (ins: PlannedInsert) => (
    <div class="stack" data-part="insert-inspector">
      <h2>New: {partName(ins.what)}</h2>
      <p class="dim" data-part="insert-where">{KIND_TEXT[ins.what.kind]}{ins.what.file ? ` · ${ins.what.file}` : ''}. Goes {POSITION_TEXT[ins.position]} {nameWithComponent(ins.anchor)}.</p>
      <div class="row">
        <button class="btn-danger" type="button" data-action="remove-insert" onClick={() => { p.removeInsert(ins.id); selectInsert(null); bump(); }}>Remove</button>
        <button type="button" data-action="deselect" onClick={() => selectInsert(null)}>Pick another</button>
      </div>
      <label class="stack">
        <span>What goes in it <span class="dim">(optional)</span></span>
        <input type="text" class="field" data-part="insert-label" placeholder="Enterprise plan, customer quotes, sign-up form…" value={ins.label ?? ''}
          onChange={e => { p.updateInsert(ins.id, { label: (e.currentTarget as HTMLInputElement).value }); setResult(null); bump(); }} />
      </label>
      <details open data-section="insert-size">
        <summary>Size</summary>
        {insertSizeRow(ins, 'width', 'Width')}
        {insertSizeRow(ins, 'height', 'Height')}
      </details>
      <details open data-section="insert-where">
        <summary>Where</summary>
        {placeButtons(ins.anchor, pos => { p.updateInsert(ins.id, { position: pos }); bump(); }, ins.position)}
        <p class="dim">Or drag ⠿ to move it among its neighbors.</p>
      </details>
      <div class="stack">
        <span>Planned</span>
        <ul class="thread" data-part="changes"><li>{layoutChangeText({ op: 'insert', what: ins.what, position: ins.position, width: ins.width, height: ins.height, ...(ins.label ? { label: ins.label } : {}) })}</li></ul>
      </div>
    </div>
  );

  const box = selected?.isConnected ? selected.getBoundingClientRect() : null;
  const hoverBox = selecting && hovered && !drag ? hovered.getBoundingClientRect() : null;
  const parent = selected?.parentElement ?? null;
  const showMove = parent ? p.previewOf(parent) : null;
  const display = selected ? p.value(selected, 'display') : '';
  const isFlex = /flex/.test(display);
  const isGrid = /grid/.test(display);
  const inFlexOrGrid = parent ? Boolean(reorderable(parent)) : false;
  const siblings = parent ? layoutChildren(parent).length : 0;
  const changes = selected && scale ? p.changes(selected, scale) : [];

  // The box model of the selection: margin (orange) outside, padding (green) inside the border
  const boxModel = () => {
    if (!selected || !box || drag) return null;
    const cs = win.getComputedStyle(selected);
    const m = SIDES.map(s => px(cs.getPropertyValue(`margin-${s}`)));
    const pd = SIDES.map(s => px(cs.getPropertyValue(`padding-${s}`)));
    const bw = SIDES.map(s => px(cs.getPropertyValue(`border-${s}-width`)));
    const strips: { cls: string; l: number; t: number; w: number; h: number }[] = [];
    const [mt, mr, mb, ml] = m as [number, number, number, number];
    strips.push({ cls: 'margin', l: box.left - ml, t: box.top - mt, w: box.width + ml + mr, h: mt });
    strips.push({ cls: 'margin', l: box.left - ml, t: box.bottom, w: box.width + ml + mr, h: mb });
    strips.push({ cls: 'margin', l: box.left - ml, t: box.top, w: ml, h: box.height });
    strips.push({ cls: 'margin', l: box.right, t: box.top, w: mr, h: box.height });
    const [pt, pr, pb, pl] = pd as [number, number, number, number];
    const [bt, br, bb, bl] = bw as [number, number, number, number];
    const il = box.left + bl, it = box.top + bt, iw = box.width - bl - br, ih = box.height - bt - bb;
    strips.push({ cls: 'pad', l: il, t: it, w: iw, h: pt });
    strips.push({ cls: 'pad', l: il, t: it + ih - pb, w: iw, h: pb });
    strips.push({ cls: 'pad', l: il, t: it + pt, w: pl, h: ih - pt - pb });
    strips.push({ cls: 'pad', l: il + iw - pr, t: it + pt, w: pr, h: ih - pt - pb });
    return strips.filter(s => s.w > 0 && s.h > 0).map(s => (
      <div class={`boxmodel ${s.cls}`} data-part={`box-${s.cls}`} style={{ left: `${s.l}px`, top: `${s.t}px`, width: `${s.w}px`, height: `${s.h}px` }} />
    ));
  };

  const toggleSelect = () => { setPlacing(null); setCatalog(false); setSelecting(s => !s); setHovered(null); };
  const toggleSketch = () => { if (!scale) return; setSketching(s => !s); setCatalog(false); setPlacing(null); setPlaceHover(null); setHovered(null); };
  useShortcuts(doc, [
    { key: LAYOUT_KEYS.select, run: toggleSelect, enabled: !sketching },
    { key: LAYOUT_KEYS.insert, run: openCatalog, enabled: !sketching },
    { key: LAYOUT_KEYS.newPage, run: toggleSketch }
  ]);

  return (
    <div class="luci luci-theme" data-theme={uiPrefs.theme} data-dock={uiPrefs.dock}>
      <div class="bar" role="toolbar" aria-label="Luci layout">
        <span class="brand" data-part="brand-title" aria-label="Luci"><LuciLogo size={48} /></span>
        {props.modes && <ModeSwitch {...props.modes} />}
        <span class="bar-sep" aria-hidden="true" />
        {!sketching && (
          <>
            <Button iconOnly size="lg" class="tool" icon={IconSelect} label="Select" tip="Click an element to change its layout" shortcut={LAYOUT_KEYS.select}
              aria-pressed={selecting && !placing} data-action="select" onClick={toggleSelect} />
            <Button iconOnly size="lg" class="tool" icon={IconAdd} label="Insert" tip="A component, a saved capture or a block" shortcut={LAYOUT_KEYS.insert}
              aria-pressed={catalog || Boolean(placing)} data-action="insert" onClick={openCatalog} />
          </>
        )}
        <Button iconOnly size="lg" class="tool" icon={IconNewPage} label="New page" tip="Sketch it from your parts" shortcut={LAYOUT_KEYS.newPage}
          aria-pressed={sketching} data-action="new-page" disabled={!scale} onClick={toggleSketch} />
        {!sketching && (
          <>
            <Button iconOnly size="lg" class="tool" icon={IconUndo} label="Undo" shortcut="Ctrl+Z" data-action="undo" disabled={!p.canUndo} onClick={() => { p.undo(); bump(); }} />
            <Button iconOnly size="lg" class="tool" icon={IconRedo} label="Redo" shortcut="Ctrl+Shift+Z" data-action="redo" disabled={!p.canRedo} onClick={() => { p.redo(); bump(); }} />
            <Button iconOnly size="lg" class="tool" icon={IconReset} label="Reset" tip="Back to what your code has" data-action="reset" disabled={!plannedCount && !p.canUndo} onClick={() => { p.reset(); bump(); }} />
            <Button iconOnly size="lg" variant="primary" class="tool" icon={IconCopy} data-action="copy-layout-prompt" disabled={!plannedCount || Boolean(busy)} loading={busy === 'copy'}
              badge={plannedCount || undefined} label={busy === 'copy' ? 'Copying' : `Copy prompt${plannedCount ? ` (${plannedCount})` : ''}`} tip="The page goes back as it was"
              onClick={() => void copyPrompt()} />
          </>
        )}
        <span class={`conn ${backend.kind}`} data-part="connection" title={backend.kind === 'project' ? 'Notes are saved in the project' : props.connectNote ?? ''}>
          {backend.kind === 'project' ? 'Project' : 'This browser'}
        </span>
        <Button iconOnly size="lg" class="tool" icon={IconClose} label="Close Luci" data-action="close" onClick={props.onClose} />
      </div>

      {sketching && scale && <Sketch doc={doc} backend={backend} base={scale.base} onClose={() => setSketching(false)} />}
      {!sketching && <>
      {!scale && <div class="sub"><Loading text="Reading the page's spacing scale…" part="scale-loading" sleep /></div>}
      {result?.why && (
        <div class="sub" role="status" data-part="reset-note">
          <p class="hint">Preview cleared. Your plan is safe in the {result.prompt ? 'copied prompt' : 'Feedback notes'}.</p>
        </div>
      )}
      {scale && selecting && !selected && !result && !catalog && !placing && (
        <div class="sub with-luci" role="note" data-part="hint">
          <Mascot pose="arrange" size={96} />
          <div class="sub-body"><p class="hint">Click an element. Drag its handles to resize, ⠿ to move it. Values snap to this page's {scale.base}px scale. Your code stays as it is.</p></div>
        </div>
      )}

      {scale && placing && !drag && (
        <div class="pick-layer" data-part="place-layer"
          onPointerMove={e => { const el = elementAt(doc, e.clientX, e.clientY); setPlaceHover(el && !isLuciUi(el) ? placeTarget(doc, el, e.clientX, e.clientY) : null); }}
          onClick={e => { const el = elementAt(doc, e.clientX, e.clientY); const t = el && !isLuciUi(el) ? placeTarget(doc, el, e.clientX, e.clientY) : null; if (t) placeAt(t.anchor, t.position); }}
          onWheel={pickWheel} onPointerLeave={() => setPlaceHover(null)} />
      )}
      {placing && placeHover && (
        <>
          {placeHover.line && <div class="drop-line" data-part="place-line" style={{ left: `${placeHover.line.left}px`, top: `${placeHover.line.top}px`, width: `${placeHover.line.width}px`, height: `${placeHover.line.height}px` }} />}
          {placeHover.outline && <div class="highlight inside" data-part="place-inside" style={{ left: `${placeHover.outline.left}px`, top: `${placeHover.outline.top}px`, width: `${placeHover.outline.width}px`, height: `${placeHover.outline.height}px` }} />}
          {(() => {
            const r = placeHover.line ?? placeHover.outline!;
            return <div class="label" data-part="place-label" style={{ left: `${Math.max(2, r.left)}px`, top: `${Math.max(0, r.top - 24)}px` }}>{partName(placing.what)}: {POSITION_TEXT[placeHover.position]} {nameWithComponent(placeHover.anchor)}</div>;
          })()}
        </>
      )}

      {p.inserts().map(ins => {
        const r = p.insertRect(ins.id);
        if (!r) return null;
        return (
          <div class="ins" data-part="insert-placeholder" data-insert-id={ins.id} aria-selected={insertSel === ins.id} role="button" tabIndex={0}
            title="A new part, planned: click to change it" style={{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }}
            onClick={() => selectInsert(ins.id)}>
            <span class="ins-name">＋ {partName(ins.what)}</span>
            {ins.label && <span class="ins-label">{ins.label}</span>}
          </div>
        );
      })}
      {selIns && insBox && (
        <>
          <div class="sel" data-part="insert-selection" style={{ left: `${insBox.left}px`, top: `${insBox.top}px`, width: `${insBox.width}px`, height: `${insBox.height}px` }} />
          {(() => {
            const above = insBox.top >= 34;
            const y = above ? insBox.top - 32 : insBox.bottom + 6;
            return (
              <>
                <button type="button" class="handle h-move" data-handle="insert-move" title="Drag to move it among its neighbors"
                  style={{ left: `${Math.max(2, insBox.left)}px`, top: `${y}px` }}
                  onPointerDown={startInsertDrag('move')} onPointerMove={onDragMove} onPointerUp={endDrag}>⠿</button>
                <div class="label" data-part="insert-size-label" style={{ left: `${Math.max(2, insBox.left) + 32}px`, top: `${y + 2}px` }}>
                  New {partName(selIns.what)}  {Math.round(insBox.width)} × {Math.round(insBox.height)}
                </div>
              </>
            );
          })()}
          {EDGES.map(edge => (
            <span class={`handle h-${edge.length === 1 ? 'side' : 'corner'}`} data-handle={`insert-${edge}`} title="Drag to resize" style={handleStyle(edge, insBox)}
              onPointerDown={startInsertDrag(edge)} onPointerMove={onDragMove} onPointerUp={endDrag} />
          ))}
        </>
      )}

      {scale && selecting && !placing && !drag && (
        <div class="pick-layer" data-part="pick-layer"
          onPointerMove={e => setHovered(elementAt(doc, e.clientX, e.clientY))}
          onClick={e => { const el = elementAt(doc, e.clientX, e.clientY); if (el && !isLuciUi(el)) select(el); }}
          onWheel={pickWheel} onPointerLeave={() => setHovered(null)} />
      )}
      {hoverBox && hovered && (
        <>
          <div class="highlight" style={{ left: `${hoverBox.left}px`, top: `${hoverBox.top}px`, width: `${hoverBox.width}px`, height: `${hoverBox.height}px` }} />
          <div class="label" data-part="hover-label" style={{ left: `${hoverBox.left}px`, top: `${Math.max(0, hoverBox.top - 24)}px` }}>{nameWithComponent(hovered)}</div>
        </>
      )}

      {boxModel()}
      {box && selected && (
        <>
          <div class="sel" data-part="selection" style={{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }} />
          {/* The grip and the label sit just above the element (below it when it is at the top of the
              window), clear of the corner handles */}
          {(() => {
            const above = box.top >= 34;
            const y = above ? box.top - 32 : box.bottom + 6;
            return (
              <>
                {siblings > 1 && (
                  <button type="button" class="handle h-move" data-handle="move" title={showMove ? 'Drag to move it among its neighbors' : 'Drag to plan a move (it cannot be shown here: the prompt says where it goes)'}
                    style={{ left: `${Math.max(2, box.left)}px`, top: `${y}px` }}
                    onPointerDown={startDrag('move')} onPointerMove={onDragMove} onPointerUp={endDrag}>⠿</button>
                )}
                <div class="label" data-part="size-label" style={{ left: `${Math.max(2, box.left) + (siblings > 1 ? 32 : 0)}px`, top: `${y + 2}px` }}>
                  {nameWithComponent(selected)}  {Math.round(box.width)} × {Math.round(box.height)}{tokenFor(`${Math.round(box.width)}px`) ? ` · ${tokenFor(`${Math.round(box.width)}px`)}` : ''}
                </div>
              </>
            );
          })()}
          {EDGES.map(edge => (
            <span class={`handle h-${edge.length === 1 ? 'side' : 'corner'}`} data-handle={edge} title="Drag to resize" style={handleStyle(edge, box)}
              onPointerDown={startDrag(edge)} onPointerMove={onDragMove} onPointerUp={endDrag} />
          ))}
        </>
      )}
      {drop && <div class="drop-line" data-part="drop-line" style={{ left: `${drop.line.left}px`, top: `${drop.line.top}px`, width: `${drop.line.width}px`, height: `${drop.line.height}px` }} />}

      {scale && (selected || selIns || catalog || placing || plannedCount > 0 || result) && (
        <div class="panel layout-panel" role="dialog" aria-label="Layout" data-part="inspector">
          {catalog ? catalogView() : placing ? placingView(placing) : selIns ? insertView(selIns) : selected ? (
            <>
              <h2>{nameWithComponent(selected)}</h2>
              <div class="row">
                <button type="button" data-action="select-parent" disabled={!parentOf(selected) || parentOf(selected) === doc.body} onClick={() => select(parentOf(selected))}>↑ Parent</button>
                <button type="button" data-action="deselect" onClick={() => select(null)}>Pick another</button>
              </div>

              <details open data-section="size">
                <summary>Size</summary>
                {lengthInput(selected, 'width', { label: 'Width' })}
                {lengthInput(selected, 'height', { label: 'Height' })}
                {lengthInput(selected, 'min-width', { label: 'Min width' })}
                {lengthInput(selected, 'max-width', { label: 'Max width' })}
                {lengthInput(selected, 'min-height', { label: 'Min height' })}
                {lengthInput(selected, 'max-height', { label: 'Max height' })}
              </details>

              <details open data-section="spacing">
                <summary>Spacing</summary>
                {sides(selected, 'margin')}
                {sides(selected, 'padding')}
              </details>

              <details open data-section="layout">
                <summary>Layout of its children</summary>
                {selectRow(selected, 'Display', 'display', DISPLAYS)}
                {isFlex && selectRow(selected, 'Direction', 'flex-direction', DIRECTIONS)}
                {isFlex && selectRow(selected, 'Wrap', 'flex-wrap', WRAPS)}
                {isGrid && (
                  <label class="lrow" data-prop="grid-template-columns">
                    <span class="lname">Columns</span>
                    <button type="button" data-step="-" onClick={() => { const n = Math.max(1, columnCount(p.value(selected, 'grid-template-columns')) - 1); setValue(selected, 'grid-template-columns', `repeat(${n}, minmax(0, 1fr))`); }}>−</button>
                    <input type="number" class="field" data-part="value-columns" min={1} value={Math.max(1, columnCount(p.value(selected, 'grid-template-columns')))}
                      onChange={e => setValue(selected, 'grid-template-columns', `repeat(${Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 1)}, minmax(0, 1fr))`)} />
                    <button type="button" data-step="+" onClick={() => { const n = Math.max(1, columnCount(p.value(selected, 'grid-template-columns'))) + 1; setValue(selected, 'grid-template-columns', `repeat(${n}, minmax(0, 1fr))`); }}>+</button>
                    <span class="dim">equal</span>
                  </label>
                )}
                {(isFlex || isGrid) && selectRow(selected, 'Justify', 'justify-content', JUSTIFY)}
                {(isFlex || isGrid) && selectRow(selected, 'Align', 'align-items', ALIGN)}
                {(isFlex || isGrid) && lengthInput(selected, 'row-gap', { label: 'Row gap' })}
                {(isFlex || isGrid) && lengthInput(selected, 'column-gap', { label: 'Column gap' })}
                {!isFlex && !isGrid && <p class="dim">Flex or grid puts its children in a row, a column or a grid.</p>}
              </details>

              {inFlexOrGrid && (
                <details open data-section="self">
                  <summary>In its parent</summary>
                  {selectRow(selected, 'Align self', 'align-self', ALIGN_SELF)}
                  {numberRow(selected, 'Grow', 'flex-grow')}
                  {numberRow(selected, 'Shrink', 'flex-shrink')}
                </details>
              )}

              {changes.some(c => c.op === 'move') && !showMove && (
                <p class="hint" data-part="move-note">This move cannot be shown here. Its neighbours are not in a row, column or grid. It is in the prompt.</p>
              )}
              <div class="stack">
                <span>Planned for this element</span>
                {changes.length
                  ? <ul class="thread" data-part="changes">{changes.map(c => <li>{layoutChangeText(c)}</li>)}</ul>
                  : <p class="dim">Nothing planned yet. Drag a handle or change a value.</p>}
              </div>
            </>
          ) : result ? null : (
            <>
              <h2>Planned on this page</h2>
              <ul class="thread" data-part="planned-elements">
                {planned.map(el => (
                  <li><button type="button" class="link-button" onClick={() => select(el)}>{nameWithComponent(el)}</button>: {p.changes(el, scale).map(layoutChangeText).join('; ')}</li>
                ))}
              </ul>
            </>
          )}

          {catalog || placing ? null : result ? (
            <div class="stack" data-part="layout-result">
              <p class={result.ok ? 'hint' : 'error'} data-part="layout-added">{result.text}</p>
              {result.why && (
                <p class="why" data-part="why-reset">
                  <strong>Why did the page go back?</strong> Layout mode only previews: nothing in your code has changed yet. Your changes are in the {result.prompt ? 'prompt' : 'notes'}, and they show for real once your agent edits the code. Reload the page after that to check them.
                </p>
              )}
              {result.prompt && <pre data-part="layout-prompt">{result.prompt}</pre>}
              <div class="row"><button type="button" data-action="result-close" onClick={() => setResult(null)}>OK</button></div>
            </div>
          ) : plannedCount > 0 && (
            <div class="stack plan-footer" data-part="plan">
              <span>Your note for the agent <span class="dim">(optional, goes with the plan)</span></span>
              <textarea data-part="layout-note" placeholder="Why, or what else should change" value={note} onInput={e => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
              <div class="row">
                <button type="button" class="btn-primary" data-action="copy-layout-prompt-panel" disabled={Boolean(busy)} onClick={() => void copyPrompt()}>
                  {busy === 'copy' ? <><ButtonSpinner />Copying…</> : `Copy prompt (${plannedCount} change${plannedCount === 1 ? '' : 's'})`}
                </button>
                <button type="button" data-action="add-layout-notes" disabled={Boolean(busy)} title="Keep the plan as Feedback notes, to send with other notes in one prompt"
                  onClick={() => void addToNotes()}>{busy === 'notes' ? <><ButtonSpinner />Adding…</> : 'Add to Feedback notes'}</button>
              </div>
              <p class="dim">Planned at {win.innerWidth}px wide. Copying puts the page back.</p>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}
