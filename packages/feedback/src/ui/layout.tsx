/**
 * Layout mode (step 1, added 13 Nov 2026): plan layout changes on the live page and hand them to the
 * agent as notes. Select an element; drag its edges to resize, ⠿ to move it among its siblings; set
 * width, height, gap, padding and margins exactly. Sizes snap to the page's spacing scale and name
 * its token. Everything is previewed on the real page (LayoutPreview), with undo, redo and reset;
 * "Add as note" turns an element's changes into a feedback note with exact steps.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ButtonSpinner, ModeSwitch, elementAt, isLuciUi, parentOf, scrollableAncestor, selectorFor, type ModeSwitchProps } from '@luci/capture';
import { FEEDBACK_PRIORITIES, layoutChangeText, type FeedbackPriority, type LayoutChange } from '@luci/format/feedback';
import type { FeedbackBackend } from '../backend.js';
import { LayoutPreview, layoutChildren, pageScale, reorderable, snapTo, type LayoutProperty, type PageScale } from '../layout/preview.js';
import { reactInfo } from '../react.js';
import { describeTarget, nameOf } from '../target.js';

export interface LayoutProps {
  doc: Document;
  backend: FeedbackBackend;
  modes?: ModeSwitchProps;
  connectNote?: string;
  onClose: () => void;
}

type Drag =
  | { kind: 'width' | 'height' | 'both'; el: Element; x: number; y: number; w: number; h: number }
  | { kind: 'move'; el: Element; x: number; y: number };

const px = (v: string) => parseFloat(v) || 0;
const nameWithComponent = (el: Element) => {
  const c = reactInfo(el)?.components.at(-1);
  return `${nameOf(el)}${c ? ` · ${c}` : ''}`;
};

/** Where a dragged element would land among its siblings, and the line that shows it. */
function dropTarget(preview: LayoutPreview, el: Element, x: number, y: number): { index: number; line: { left: number; top: number; width: number; height: number } } | null {
  const parent = el.parentElement;
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
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  // The page's scale is read once (a snapshot of the page); the preview is undone on leaving
  useEffect(() => {
    const t = setTimeout(() => setScale(pageScale(doc)), 0);
    const onMove = () => bump();
    win.addEventListener('scroll', onMove, true);
    win.addEventListener('resize', onMove);
    return () => {
      clearTimeout(t);
      win.removeEventListener('scroll', onMove, true);
      win.removeEventListener('resize', onMove);
      preview.current?.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') {
        if (drag) setDrag(null);
        else if (selected) { setSelected(null); setSelecting(true); }
        else if (selecting) setSelecting(false);
        else return;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) preview.current!.redo(); else preview.current!.undo();
        bump();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [drag, selected, selecting]);

  const p = preview.current;
  const base = scale?.base ?? 4;
  const tokenFor = (v: string) => scale?.tokens.get(px(v));

  // ---- Picking ---------------------------------------------------------------------------------
  const select = (el: Element | null) => {
    setSelected(el);
    setSelecting(!el);
    setHovered(null);
    setNote(null);
  };
  const pickWheel = (e: WheelEvent) => {
    const box = scrollableAncestor(elementAt(doc, e.clientX, e.clientY), e.deltaX, e.deltaY);
    if (box) box.scrollBy(e.deltaX, e.deltaY); else win.scrollBy(e.deltaX, e.deltaY);
  };

  // ---- Dragging handles ------------------------------------------------------------------------
  const startDrag = (kind: Drag['kind']) => (e: PointerEvent) => {
    if (!selected) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const r = selected.getBoundingClientRect();
    setDrag(kind === 'move' ? { kind, el: selected, x: e.clientX, y: e.clientY } : { kind, el: selected, x: e.clientX, y: e.clientY, w: r.width, h: r.height });
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'move') { setDrop(dropTarget(p, drag.el, e.clientX, e.clientY)); return; }
    if (drag.kind !== 'height') p.set(drag.el, 'width', `${snapTo(drag.w + e.clientX - drag.x, base)}px`);
    if (drag.kind !== 'width') p.set(drag.el, 'height', `${snapTo(drag.h + e.clientY - drag.y, base)}px`);
    bump();
  };
  const endDrag = () => {
    if (drag?.kind === 'move' && drop) p.move(drag.el, drop.index);
    setDrag(null);
    setDrop(null);
    bump();
  };

  // ---- Adding a note ---------------------------------------------------------------------------
  const changes: LayoutChange[] = selected && scale ? p.changes(selected, scale) : [];
  const [why, setWhy] = useState('');
  const [priority, setPriority] = useState<FeedbackPriority>('medium');
  const [busy, setBusy] = useState(false);
  const addNote = async () => {
    if (!selected || !changes.length) return;
    setBusy(true);
    try {
      const { target, pageSource } = await describeTarget(selected, backend.resolveFrames ? { serverResolve: backend.resolveFrames } : {});
      const summary = changes.map(layoutChangeText).join('; ');
      const item = await backend.add({
        page: { url: doc.location.href, title: doc.title, ...(pageSource ? { source: pageSource } : {}) },
        target,
        comment: why.trim() || `Layout: ${summary}`,
        intent: 'change',
        priority,
        layout: { viewport: { width: win.innerWidth, height: win.innerHeight }, changes }
      });
      setNote({ ok: true, text: `Added ${item.ref}. Its marker shows in Feedback mode, and it is in the next prompt.` });
      setWhy('');
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const plannedCount = scale ? p.changed(scale).length : 0;
  const box = selected?.isConnected ? selected.getBoundingClientRect() : null;
  const hoverBox = selecting && hovered && !drag ? hovered.getBoundingClientRect() : null;
  const parent = selected?.parentElement ?? null;
  const canPreviewMove = parent ? Boolean(reorderable(parent)) : false;
  const isContainer = selected ? Boolean(reorderable(selected)) : false;
  const siblings = parent ? layoutChildren(parent).length : 0;

  // A plain function (not a component), so a field keeps its focus while the panel re-renders
  const row = (label: string, prop: LayoutProperty) => {
    if (!selected) return null;
    const v = p.value(selected, prop);
    const token = tokenFor(v);
    const set = (n: number) => { p.set(selected, prop, `${Math.max(0, Math.round(n * 100) / 100)}px`); bump(); };
    return (
      <div class="lrow" data-prop={prop} key={prop}>
        <span class="lname">{label}</span>
        <button type="button" data-step="-" aria-label={`Smaller ${label}`} onClick={() => set(snapTo(px(v) - base, base))}>−</button>
        <input type="number" class="field" data-part={`value-${prop}`} value={Math.round(px(v) * 100) / 100} min={0}
          onChange={e => set(Number((e.currentTarget as HTMLInputElement).value))} />
        <span class="dim">px</span>
        <button type="button" data-step="+" aria-label={`Larger ${label}`} onClick={() => set(snapTo(px(v) + base, base))}>+</button>
        <span class="token dim" data-part={`token-${prop}`}>{token ?? ''}</span>
      </div>
    );
  };

  return (
    <div class="luci">
      <div class="bar" role="toolbar" aria-label="Luci layout">
        <span class="brand">Luci</span>
        {props.modes && <ModeSwitch {...props.modes} />}
        <button type="button" aria-pressed={selecting} data-action="select" title="Click an element to change its layout (Esc to stop)" onClick={() => { setSelecting(s => !s); setHovered(null); }}>Select</button>
        <button type="button" data-action="undo" disabled={!p.canUndo} title="Undo (Ctrl+Z)" onClick={() => { p.undo(); bump(); }}>Undo</button>
        <button type="button" data-action="redo" disabled={!p.canRedo} title="Redo (Ctrl+Shift+Z)" onClick={() => { p.redo(); bump(); }}>Redo</button>
        <button type="button" data-action="reset" disabled={!plannedCount && !p.canUndo} title="Put the page back as it is in your code" onClick={() => { p.reset(); bump(); }}>Reset</button>
        <span class="dim" data-part="planned">{plannedCount ? `${plannedCount} changed` : ''}</span>
        <span class={`conn ${backend.kind}`} data-part="connection" title={backend.kind === 'project' ? 'Notes are saved in the project, where your agent reads them' : props.connectNote ?? ''}>
          {backend.kind === 'project' ? 'Project' : 'This browser'}
        </span>
        <button type="button" aria-label="Close Luci" data-action="close" onClick={props.onClose}>×</button>
      </div>

      {!scale && <div class="sub"><p class="loading"><ButtonSpinner />Reading the page's spacing scale…</p></div>}
      {scale && selecting && !selected && (
        <div class="sub" role="note" data-part="hint">
          <p class="hint">Click an element to change its layout: drag its edges to resize, ⠿ to move it among its neighbors. Values snap to this page's {scale.base}px scale. Nothing changes in your code until your agent applies the note.</p>
        </div>
      )}

      {scale && selecting && !drag && (
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

      {box && selected && (
        <>
          <div class="sel" data-part="selection" style={{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` }} />
          <div class="label" data-part="size-label" style={{ left: `${box.left}px`, top: `${Math.max(0, box.top - 24)}px` }}>
            {nameWithComponent(selected)}  {Math.round(box.width)} × {Math.round(box.height)}{tokenFor(`${Math.round(box.width)}px`) ? ` · ${tokenFor(`${Math.round(box.width)}px`)}` : ''}
          </div>
          {siblings > 1 && (
            <button type="button" class="handle h-move" data-handle="move" title="Drag to move it among its neighbors" style={{ left: `${box.left - 14}px`, top: `${box.top - 14}px` }}
              onPointerDown={startDrag('move')} onPointerMove={onDragMove} onPointerUp={endDrag}>⠿</button>
          )}
          <span class="handle h-right" data-handle="width" title="Drag to change the width" style={{ left: `${box.right - 5}px`, top: `${box.top + box.height / 2 - 12}px` }}
            onPointerDown={startDrag('width')} onPointerMove={onDragMove} onPointerUp={endDrag} />
          <span class="handle h-bottom" data-handle="height" title="Drag to change the height" style={{ left: `${box.left + box.width / 2 - 12}px`, top: `${box.bottom - 5}px` }}
            onPointerDown={startDrag('height')} onPointerMove={onDragMove} onPointerUp={endDrag} />
          <span class="handle h-corner" data-handle="both" title="Drag to change both" style={{ left: `${box.right - 7}px`, top: `${box.bottom - 7}px` }}
            onPointerDown={startDrag('both')} onPointerMove={onDragMove} onPointerUp={endDrag} />
        </>
      )}
      {drop && <div class="drop-line" data-part="drop-line" style={{ left: `${drop.line.left}px`, top: `${drop.line.top}px`, width: `${drop.line.width}px`, height: `${drop.line.height}px` }} />}

      {selected && scale && (
        <div class="panel layout-panel" role="dialog" aria-label="Layout" data-part="inspector">
          <h2>{nameWithComponent(selected)}</h2>
          <div class="row">
            <button type="button" data-action="select-parent" disabled={!parentOf(selected) || parentOf(selected) === doc.body} onClick={() => select(parentOf(selected))}>↑ Parent</button>
            <button type="button" data-action="deselect" onClick={() => select(null)}>Pick another</button>
          </div>
          <div class="stack">
            {row('Width', 'width')}
            {row('Height', 'height')}
            {isContainer && row('Gap', 'gap')}
            {row('Padding', 'padding')}
            {row('Margin top', 'margin-top')}
            {row('Margin bottom', 'margin-bottom')}
          </div>
          {changes.some(c => c.op === 'move') && !canPreviewMove && (
            <p class="hint" data-part="move-note">Its parent is not a flex or grid container, so the move is planned but not shown. The note tells the agent where it goes.</p>
          )}
          <div class="stack">
            <span>Planned for this element</span>
            {changes.length
              ? <ul class="thread" data-part="changes">{changes.map(c => <li>{layoutChangeText(c)}</li>)}</ul>
              : <p class="dim">Nothing yet: drag a handle, or change a value above.</p>}
          </div>
          <textarea data-part="why" placeholder="Why, or what else (optional)" value={why} onInput={e => setWhy((e.currentTarget as HTMLTextAreaElement).value)} />
          <div class="row">
            <label>Priority <select data-part="priority" value={priority} onChange={e => setPriority((e.currentTarget as HTMLSelectElement).value as FeedbackPriority)}>
              {FEEDBACK_PRIORITIES.map(v => <option value={v}>{v}</option>)}
            </select></label>
            <button type="button" class="primary" data-action="add-layout-note" disabled={!changes.length || busy} onClick={() => void addNote()}>{busy ? <><ButtonSpinner />Adding…</> : 'Add as note'}</button>
          </div>
          {note && <p class={note.ok ? 'dim' : 'error'} data-part="layout-added">{note.text}</p>}
          <p class="dim">Planned at {win.innerWidth}px wide. The agent keeps other widths working.</p>
        </div>
      )}
    </div>
  );
}
