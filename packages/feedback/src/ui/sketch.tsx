/**
 * Layout mode step 3 (FR32): sketch a new page. A full-window canvas over the app: rows from top to
 * bottom, each split into blocks side by side; each block is one of the app's components, a saved
 * capture, a generic block or an area, with what goes in it. Rows are resized by their bottom
 * handle (snapped to the page's scale), blocks by the line between them. The sketch is copied as a
 * new-page prompt, or kept as a Feedback note.
 */
import { Fragment } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ButtonSpinner } from '@luci/capture';
import { Mascot } from '@luci/ui';
import { formatWireframePrompt, routeOf, shareText, wireframeSchema, type Part, type Wireframe } from '@luci/format/feedback';
import type { FeedbackBackend } from '../backend.js';
import { snapTo } from '../layout/preview.js';
import { copyToClipboard } from './clipboard.js';
import { EMPTY_SOURCES, PartPicker, componentFile, loadSources, namedPart, partName, type Chosen, type PartSources } from './parts.js';

export interface SketchProps {
  doc: Document;
  backend: FeedbackBackend;
  /** The page's base unit: heights snap to it. */
  base: number;
  onClose: () => void;
}

interface Block { id: number; span: number; what?: Part; label?: string }
interface Row { id: number; height: number; blocks: Block[] }

type Drag =
  | { kind: 'height'; row: number; y: number; h: number }
  | { kind: 'divider'; row: number; index: number; left: number; right: number; total: number };

const letter = (i: number) => String.fromCharCode(97 + i);
/** "/enterprise" from "enterprise", "Enterprise plans" -> "/enterprise-plans". */
export const normalRoute = (v: string) => `/${v.trim().replace(/^\/+/, '').replace(/\s+/g, '-').toLowerCase()}`;

export function Sketch(props: SketchProps) {
  const { doc, backend, base } = props;
  const win = doc.defaultView ?? window;
  const ids = useRef(1);
  const id = () => ids.current++;
  const snap = (n: number) => Math.max(base * 4, snapTo(n, base));
  // A start most pages share: navigation, a section, a footer
  const [rows, setRows] = useState<Row[]>(() => [
    { id: id(), height: snap(64), blocks: [{ id: id(), span: 12, what: { kind: 'block', name: 'navigation' } }] },
    { id: id(), height: snap(360), blocks: [{ id: id(), span: 12, what: { kind: 'block', name: 'section' } }] },
    { id: id(), height: snap(160), blocks: [{ id: id(), span: 12, what: { kind: 'block', name: 'footer' } }] }
  ]);
  const [past, setPast] = useState<Row[][]>([]);
  const [future, setFuture] = useState<Row[][]>([]);
  const [route, setRoute] = useState('/new-page');
  const [sel, setSel] = useState<{ row: number; block: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [sources, setSources] = useState<PartSources>(EMPTY_SOURCES);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; prompt?: string } | null>(null);

  /** A change with an undo step (drags take one step at their start). */
  const change = (fn: (rows: Row[]) => Row[], step = true) => {
    setResult(null);
    if (step) { setPast(p => [...p, rows]); setFuture([]); }
    setRows(fn);
  };
  const undo = () => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setFuture([rows, ...future]); setRows(prev); };
  const redo = () => { const next = future[0]; if (!next) return; setFuture(future.slice(1)); setPast([...past, rows]); setRows(next); };

  const rowAt = (rowId: number) => rows.find(r => r.id === rowId);
  const mapRow = (rowId: number, fn: (r: Row) => Row) => (rs: Row[]) => rs.map(r => (r.id === rowId ? fn(r) : r));
  const mapBlock = (rowId: number, blockId: number, fn: (b: Block) => Block) => mapRow(rowId, r => ({ ...r, blocks: r.blocks.map(b => (b.id === blockId ? fn(b) : b)) }));
  const selRow = sel ? rowAt(sel.row) : undefined;
  const selBlock = selRow?.blocks.find(b => b.id === sel!.block);

  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') {
        if (drag) setDrag(null);
        else if (picking) setPicking(false);
        else if (sel) setSel(null);
        else props.onClose();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) removeBlock();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (e.shiftKey) redo(); else undo(); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  });

  // ---- Rows and blocks --------------------------------------------------------------------------
  const addRow = (after?: number) => {
    const row: Row = { id: id(), height: snap(240), blocks: [{ id: id(), span: 12 }] };
    change(rs => {
      const at = after === undefined ? rs.length : rs.findIndex(r => r.id === after) + 1;
      return [...rs.slice(0, at), row, ...rs.slice(at)];
    });
    setSel({ row: row.id, block: row.blocks[0]!.id });
  };
  /** Split the selected block in two: it keeps the left half, a new empty block takes the right. */
  const split = () => {
    if (!sel || !selBlock || selBlock.span < 2 || selRow!.blocks.length >= 12) return;
    const right: Block = { id: id(), span: Math.floor(selBlock.span / 2) };
    change(mapRow(sel.row, r => ({
      ...r,
      blocks: r.blocks.flatMap(b => (b.id === sel.block ? [{ ...b, span: Math.ceil(b.span / 2) }, right] : [b]))
    })));
    setSel({ row: sel.row, block: right.id });
  };
  const removeBlock = () => {
    if (!sel || !selRow) return;
    if (selRow.blocks.length === 1) { removeRow(); return; }
    change(mapRow(sel.row, r => {
      // Its share goes to its neighbor, so the row stays as wide
      const i = r.blocks.findIndex(b => b.id === sel.block);
      const gone = r.blocks[i]!;
      const n = i > 0 ? i - 1 : 1;
      return { ...r, blocks: r.blocks.map((b, j) => (j === n ? { ...b, span: Math.min(12, b.span + gone.span) } : b)).filter(b => b.id !== gone.id) };
    }));
    setSel(null);
  };
  const removeRow = () => {
    if (!sel || rows.length === 1) return;
    change(rs => rs.filter(r => r.id !== sel.row));
    setSel(null);
  };
  const moveRow = (d: -1 | 1) => {
    if (!sel) return;
    const i = rows.findIndex(r => r.id === sel.row);
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    change(rs => { const out = [...rs]; [out[i], out[j]] = [out[j]!, out[i]!]; return out; });
  };
  const choose = (c: Chosen) => {
    if (!sel) return;
    const { row, block } = sel;
    const what = namedPart(c);
    change(mapBlock(row, block, b => ({ ...b, what })));
    setPicking(false);
    void componentFile(c, backend).then(file => { if (file) setRows(mapBlock(row, block, b => (b.what === what ? { ...b, what: { ...what, file } } : b))); });
  };

  // ---- Dragging: a row's height, the line between two blocks -----------------------------------
  const startHeight = (row: Row) => (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setPast(p => [...p, rows]); setFuture([]); setResult(null);
    setDrag({ kind: 'height', row: row.id, y: e.clientY, h: row.height });
  };
  const startDivider = (row: Row, index: number) => (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const line = e.currentTarget as HTMLElement;
    line.setPointerCapture(e.pointerId);
    const left = (line.previousElementSibling as HTMLElement).getBoundingClientRect().left;
    const right = (line.nextElementSibling as HTMLElement).getBoundingClientRect().right;
    setPast(p => [...p, rows]); setFuture([]); setResult(null);
    setDrag({ kind: 'divider', row: row.id, index, left, right, total: row.blocks[index - 1]!.span + row.blocks[index]!.span });
  };
  const onDrag = (e: PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'height') { setRows(mapRow(drag.row, r => ({ ...r, height: snap(drag.h + e.clientY - drag.y) }))); return; }
    const frac = (e.clientX - drag.left) / Math.max(1, drag.right - drag.left);
    const leftSpan = Math.max(1, Math.min(drag.total - 1, Math.round(frac * drag.total)));
    setRows(mapRow(drag.row, r => ({ ...r, blocks: r.blocks.map((b, j) => (j === drag.index - 1 ? { ...b, span: leftSpan } : j === drag.index ? { ...b, span: drag.total - leftSpan } : b)) })));
  };
  const endDrag = () => setDrag(null);

  // ---- The result: a prompt, or a Feedback note ----------------------------------------------------
  const sketch = (): Wireframe => wireframeSchema.parse({
    route: normalRoute(route),
    viewport: { width: win.innerWidth, height: win.innerHeight },
    rows: rows.map(r => ({ height: `${r.height}px`, blocks: r.blocks.map(b => ({ ...(b.what ? { what: b.what } : {}), ...(b.label?.trim() ? { label: b.label.trim() } : {}), span: b.span })) }))
  });
  const copy = async () => {
    setBusy('copy');
    try {
      const prompt = formatWireframePrompt({ wireframe: sketch(), sketchedOn: routeOf(doc.location.href), ...(note.trim() ? { note } : {}) });
      const copied = await copyToClipboard(doc, prompt);
      setResult({ ok: true, text: copied ? 'Copied. Paste it to your agent.' : 'Copy it from below and paste it to your agent.', prompt });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };
  const keep = async () => {
    setBusy('notes');
    try {
      const wireframe = sketch();
      const item = await backend.add({
        page: { url: doc.location.href, title: doc.title },
        target: { kind: 'element', selector: 'body', element: 'body' },
        comment: note.trim() || `New page ${wireframe.route}`,
        intent: 'change',
        priority: 'medium',
        wireframe
      });
      setResult({ ok: true, text: `Added ${item.ref} to Feedback notes. It goes in the next Copy prompt there.` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  // ---- View -------------------------------------------------------------------------------------
  const rowIndex = sel ? rows.findIndex(r => r.id === sel.row) : -1;
  const blockIndex = selRow ? selRow.blocks.findIndex(b => b.id === sel!.block) : -1;
  const selName = rowIndex >= 0 ? `${rowIndex + 1}${selRow!.blocks.length > 1 ? letter(blockIndex) : ''}` : '';
  return (
    <>
      <div class="wf" data-part="sketch" onPointerMove={onDrag} onPointerUp={endDrag}>
        <div class="wf-tools">
          <label class="wf-route"><span>New page</span>
            <input type="text" class="field" data-part="wf-route" value={route} spellcheck={false} onInput={e => { setRoute((e.currentTarget as HTMLInputElement).value); setResult(null); }} />
          </label>
          <button type="button" data-action="wf-add-row" onClick={() => addRow()}>+ Row</button>
          <button type="button" data-action="wf-undo" disabled={!past.length} onClick={undo}>Undo</button>
          <button type="button" data-action="wf-redo" disabled={!future.length} onClick={redo}>Redo</button>
          <span class="dim">Sketched at {win.innerWidth}px wide. Heights snap to {base}px. Drag a row's bottom edge or the line between blocks.</span>
          <button type="button" data-action="wf-close" onClick={props.onClose}>Back to the page</button>
        </div>
        <div class="wf-page">
          {rows.map((row, ri) => {
            const total = row.blocks.reduce((n, b) => n + b.span, 0);
            return (
              <div class="wf-row" data-row={ri + 1} key={row.id} style={{ height: `${row.height}px` }}>
                <span class="wf-row-num">{ri + 1}</span>
                {row.blocks.map((b, bi) => (
                  <Fragment key={b.id}>
                    {bi > 0 && <span class="wf-divider" data-divider={`${ri + 1}-${bi}`} title="Drag to share the width differently" onPointerDown={startDivider(row, bi)} />}
                    <div class="wf-block" key={b.id} role="button" tabIndex={0} data-block={`${ri + 1}${letter(bi)}`} aria-selected={sel?.block === b.id}
                      style={{ flex: `${b.span} 1 0` }} onClick={() => { setSel({ row: row.id, block: b.id }); setPicking(false); }}>
                      <span class="ins-name">{b.what ? `＋ ${partName(b.what)}` : 'Area'}</span>
                      {b.label && <span class="ins-label">{b.label}</span>}
                      <span class="wf-share">{row.blocks.length > 1 ? shareText(b.span, total).replace(' of the width', '') : 'full width'} · {row.height}px</span>
                    </div>
                  </Fragment>
                ))}
                <span class="wf-row-handle" data-row-handle={ri + 1} title="Drag to change its height" onPointerDown={startHeight(row)} />
              </div>
            );
          })}
        </div>
      </div>

      <div class="panel layout-panel" role="dialog" aria-label="New page" data-part="sketch-panel">
        {picking && sel ? (
          <div class="stack" data-part="wf-catalog">
            <h2>What is {selName}?</h2>
            <PartPicker sources={sources} onChoose={choose} />
            <div class="row"><button type="button" data-action="wf-cancel-choose" onClick={() => setPicking(false)}>Cancel</button></div>
          </div>
        ) : selBlock && selRow ? (
          <div class="stack" data-part="wf-inspector">
            <h2>Part {selName}</h2>
            <p class="dim" data-part="wf-what">{selBlock.what ? `${{ component: 'Your component', capture: 'Saved capture', block: 'Block' }[selBlock.what.kind]}: ${partName(selBlock.what)}${selBlock.what.file ? ` · ${selBlock.what.file}` : ''}` : 'An area: say what goes in it, or choose what it is.'}</p>
            <div class="row">
              <button type="button" data-action="wf-choose" onClick={() => { loadSources(doc, backend, setSources); setPicking(true); }}>Choose what it is…</button>
              {selBlock.what && <button class="btn-secondary" type="button" data-action="wf-clear" onClick={() => change(mapBlock(selRow.id, selBlock.id, ({ what: _w, ...b }) => b))}>Make it an area</button>}
            </div>
            <label class="stack">
              <span>What goes in it <span class="dim">(optional)</span></span>
              <input type="text" class="field" data-part="wf-label" placeholder="Headline and pitch, product screenshot, three plans…" value={selBlock.label ?? ''}
                onChange={e => change(mapBlock(selRow.id, selBlock.id, b => ({ ...b, label: (e.currentTarget as HTMLInputElement).value })))} />
            </label>
            <details open data-section="wf-block">
              <summary>This part</summary>
              <div class="row">
                <button type="button" data-action="wf-split" disabled={selBlock.span < 2 || selRow.blocks.length >= 12} title="Two side by side: this one and a new one on its right" onClick={split}>Split in two</button>
                <button class="btn-danger" type="button" data-action="wf-remove-block" onClick={removeBlock}>Remove</button>
              </div>
            </details>
            <details open data-section="wf-row">
              <summary>Row {rowIndex + 1}</summary>
              <div class="lrow" data-prop="wf-height">
                <span class="lname">Height</span>
                <button type="button" data-step="-" aria-label="Lower" onClick={() => change(mapRow(selRow.id, r => ({ ...r, height: snap(r.height - base * 4) })))}>−</button>
                <input type="text" class="field" data-part="wf-height" value={String(selRow.height)}
                  onChange={e => { const n = Number((e.currentTarget as HTMLInputElement).value); if (n > 0) change(mapRow(selRow.id, r => ({ ...r, height: snap(n) }))); }} />
                <button type="button" data-step="+" aria-label="Taller" onClick={() => change(mapRow(selRow.id, r => ({ ...r, height: snap(r.height + base * 4) })))}>+</button>
                <span class="token dim">px</span>
              </div>
              <div class="row">
                <button type="button" data-action="wf-row-up" disabled={rowIndex === 0} onClick={() => moveRow(-1)}>Move up</button>
                <button type="button" data-action="wf-row-down" disabled={rowIndex === rows.length - 1} onClick={() => moveRow(1)}>Move down</button>
                <button type="button" data-action="wf-row-below" onClick={() => addRow(selRow.id)}>+ Row below</button>
                <button class="btn-danger" type="button" data-action="wf-remove-row" disabled={rows.length === 1} onClick={removeRow}>Remove row</button>
              </div>
            </details>
          </div>
        ) : (
          <div class="stack" data-part="wf-summary">
            <h2>New page {normalRoute(route)}</h2>
            <div class="luci-hint" data-part="sketch-hint">
              <Mascot pose="sketch" size={96} />
              <p class="dim">{rows.length} row{rows.length === 1 ? '' : 's'}, top to bottom. Click a part to name it, describe it or split it.</p>
            </div>
          </div>
        )}

        {!picking && (result ? (
          <div class="stack" data-part="wf-result">
            <p class={result.ok ? 'hint' : 'error'} data-part="wf-added">{result.text}</p>
            {result.prompt && <pre data-part="wf-prompt">{result.prompt}</pre>}
            <div class="row"><button type="button" data-action="wf-result-close" onClick={() => setResult(null)}>OK</button></div>
          </div>
        ) : (
          <div class="stack plan-footer" data-part="wf-plan">
            <span>Your note for the agent <span class="dim">(optional)</span></span>
            <textarea data-part="wf-note" placeholder="What the page is for, who it is for" value={note} onInput={e => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
            <div class="row">
              <button type="button" class="btn-primary" data-action="wf-copy" disabled={Boolean(busy)} onClick={() => void copy()}>
                {busy === 'copy' ? <><ButtonSpinner />Copying…</> : 'Copy page prompt'}
              </button>
              <button type="button" data-action="wf-notes" disabled={Boolean(busy)} title="Keep the sketch as a Feedback note, to send with other notes in one prompt" onClick={() => void keep()}>
                {busy === 'notes' ? <><ButtonSpinner />Adding…</> : 'Add to Feedback notes'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
