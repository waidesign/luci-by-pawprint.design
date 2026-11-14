/**
 * The Feedback layer of the dev toolbar (FR23-FR31): annotate an element (click) or a text selection,
 * with intent and priority; numbered markers show each note's status on the page; the notes panel
 * lists them page by page and copies the page-grouped prompt (marking what it sent); settings for
 * the marker color, the prompt's detail level and a webhook; pause animations to annotate one frame.
 * Notes live in a FeedbackBackend.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { AppearanceControls, ButtonSpinner, LuciLogo, ModeSwitch, elementAt, isLuciUi, scrollableAncestor, useUiPrefs, type ModeSwitchProps, type UiPrefs } from '@luci/capture';
import {
  DETAIL_LEVELS,
  FEEDBACK_INTENTS,
  FEEDBACK_PRIORITIES,
  OPEN_STATUSES,
  parseRef,
  routeOf,
  sourceText,
  type DetailLevel,
  type FeedbackIntent,
  type FeedbackItem,
  type FeedbackPriority
} from '@luci/format/feedback';
import { Button, COPY, EmptyState, IconAnnotate, IconClose, IconCopy, IconPause, PALETTE } from '@luci/ui';
import type { FeedbackBackend } from '../backend.js';
import { copyToClipboard } from './clipboard.js';
import { describeTarget, frameworkInfo, nameOf, selectionElement } from '../target.js';

export interface FeedbackSettings {
  markerColor: string;
  detail: DetailLevel;
  /** Where "Send to webhook" posts the prompt; nothing is sent until the person presses it. */
  webhookUrl?: string;
}
/** Marker colours, from the brand palette: Charcoal, Ginger, Collar Lime, Nose Pink, Info teal. */
export const MARKER_COLORS = [PALETTE['muzzle-900'], PALETTE['ginger-500'], PALETTE['collar-lime-500'], PALETTE['nose-pink-500'], PALETTE['info-700']] as const;
/** The number's colour on each marker (4.5:1 or better); a colour saved before these is read as dark. */
const LIGHT_MARKERS: readonly string[] = [PALETTE['ginger-500'], PALETTE['collar-lime-500'], PALETTE['nose-pink-500']];
const markerInk = (color: string) => (LIGHT_MARKERS.includes(color.toUpperCase()) ? 'var(--luci-color-muzzle-900)' : 'var(--luci-color-muzzle-50)');
export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = { markerColor: MARKER_COLORS[0], detail: 'standard' };

export interface FeedbackProps {
  doc: Document;
  backend: FeedbackBackend;
  /** Shown in the bar: how to keep notes in the project when they are only in this browser. */
  connectNote?: string;
  settings: FeedbackSettings;
  onSettingsChange?: (settings: FeedbackSettings) => void;
  /** The dev toolbar's mode switch (Feedback, Capture, ...). */
  modes?: ModeSwitchProps;
  /** Look for `luci serve` again (the badge becomes a button); resolves null when connected, else why not. */
  onConnect?: () => Promise<string | null>;
  onClose: () => void;
}

/**
 * Three statuses, all set by the person (changed 13 Nov 2026: no agent sync): new, copied in a
 * prompt, done. Statuses from the earlier agent sync read as copied or done.
 */
type Shown = 'new' | 'copied' | 'done';
export const shownStatus = (s: FeedbackItem['status']): Shown => (s === 'pending' ? 'new' : s === 'resolved' || s === 'dismissed' ? 'done' : 'copied');
export const STATUS_TEXT: Readonly<Record<Shown, string>> = { new: 'New', copied: 'Copied', done: 'Done' };
const STATUS_MARK: Readonly<Record<Shown, string>> = { new: '', copied: '', done: '✓' };
const isOpen = (i: FeedbackItem) => OPEN_STATUSES.includes(i.status);
const isCopied = (i: FeedbackItem) => shownStatus(i.status) === 'copied';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Draft {
  el: Element;
  selectedText?: string;
  at: { x: number; y: number };
}

type Act = (fn: () => Promise<unknown>) => Promise<void>;
type NoteFields = { comment: string; intent: FeedbackIntent; priority: FeedbackPriority };

/** Where a popover goes: below the point, kept inside the window. */
const popAt = (win: Window, x: number, y: number) => ({
  left: `${Math.max(12, Math.min(x, win.innerWidth - 352))}px`,
  top: `${Math.max(12, Math.min(y + 12, win.innerHeight - 320))}px`
});

/** The CSS that freezes a page for annotating one frame (FR31). */
export const PAUSE_CSS = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }';

/**
 * What "Copy prompt" sends: the new notes when there are any, else every note not done yet
 * (FR29: sent notes are not repeated unless asked; asking is one click, never a dead button).
 */
export function copyScope(items: readonly FeedbackItem[]): { includeSent: boolean; count: number; label: string } {
  const fresh = items.filter(i => i.status === 'pending').length;
  const open = items.filter(isOpen).length;
  return fresh ? { includeSent: false, count: fresh, label: `${fresh} new` } : { includeSent: true, count: open, label: `all ${open}` };
}

export function Feedback(props: FeedbackProps) {
  const { doc, backend } = props;
  const win = doc.defaultView ?? window;
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [candidate, setCandidate] = useState<Element | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [panel, setPanel] = useState<'items' | 'settings' | null>(null);
  const [settings, setSettings] = useState<FeedbackSettings>(props.settings);
  const [href, setHref] = useState(doc.location.href);
  const [selection, setSelection] = useState<{ el: Element; text: string; x: number; y: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copyMenu, setCopyMenu] = useState(false);
  const [uiPrefs, setUiPrefs] = useUiPrefs(doc);
  const [, setTick] = useState(0);

  const reload = async () => {
    try {
      const next = await backend.list();
      setItems(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const act: Act = async (fn) => {
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Notes load at start, and again when the person comes back to the tab (another tab may have added some)
  useEffect(() => {
    void reload();
    const onVisible = () => { if (doc.visibilityState === 'visible') void reload(); };
    doc.addEventListener('visibilitychange', onVisible);
    win.addEventListener('focus', onVisible);
    return () => { doc.removeEventListener('visibilitychange', onVisible); win.removeEventListener('focus', onVisible); };
  }, [backend]);

  // Single-page apps change routes without a page load: follow the address, and keep markers on their elements
  useEffect(() => {
    const timer = setInterval(() => setHref(h => (h === doc.location.href ? h : doc.location.href)), 300);
    const onMove = () => setTick(t => t + 1);
    win.addEventListener('scroll', onMove, true);
    win.addEventListener('resize', onMove);
    return () => { clearInterval(timer); win.removeEventListener('scroll', onMove, true); win.removeEventListener('resize', onMove); };
  }, []);

  // A text selection on the page offers "Add feedback" next to it (FR23)
  useLayoutEffect(() => {
    const onUp = (e: MouseEvent) => {
      if (annotating || e.composedPath().some(n => n instanceof Element && isLuciUi(n))) return;
      setTimeout(() => {
        const sel = win.getSelection();
        const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
        if (!text || !sel!.rangeCount) { setSelection(null); return; }
        const range = sel!.getRangeAt(0);
        const el = selectionElement(range);
        if (!el || isLuciUi(el)) return;
        const r = range.getBoundingClientRect();
        setSelection({ el, text, x: r.left, y: r.bottom });
      }, 0);
    };
    doc.addEventListener('mouseup', onUp, true);
    return () => doc.removeEventListener('mouseup', onUp, true);
  }, [annotating]);

  // Esc: closes the menu or form, then leaves annotate mode
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (copyMenu) setCopyMenu(false);
      else if (draft) setDraft(null);
      else if (openRef) setOpenRef(null);
      else if (annotating) { setAnnotating(false); setCandidate(null); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [draft, openRef, annotating, copyMenu]);

  // Pause animations (FR31): page animations, transitions and videos stop on the current frame,
  // straight after the render (not after the next paint)
  useLayoutEffect(() => {
    if (!paused) return;
    const style = doc.createElement('style');
    style.setAttribute('data-luci-ui', '');
    style.textContent = PAUSE_CSS;
    doc.head.appendChild(style);
    const animations = (doc.getAnimations?.() ?? []).filter(a => a.playState === 'running');
    animations.forEach(a => a.pause());
    const videos = Array.from(doc.querySelectorAll('video')).filter(v => !v.paused);
    videos.forEach(v => v.pause());
    return () => {
      style.remove();
      animations.forEach(a => a.play());
      videos.forEach(v => void v.play().catch(() => undefined));
    };
  }, [paused]);

  const changeSettings = (next: FeedbackSettings) => {
    setSettings(next);
    props.onSettingsChange?.(next);
  };

  const route = routeOf(href);
  const here = items.filter(i => i.page.route === route);
  const scope = copyScope(items);
  const fresh = items.filter(i => i.status === 'pending').length;
  const openCount = items.filter(isOpen).length;

  // ---- Annotating -------------------------------------------------------------------------
  const startDraft = (el: Element, x: number, y: number, selectedText?: string) => {
    setOpenRef(null);
    setPanel(null);
    setSelection(null);
    setDraft({ el, at: { x, y }, ...(selectedText ? { selectedText } : {}) });
  };
  const pickMove = (e: PointerEvent) => setCandidate(elementAt(doc, e.clientX, e.clientY));
  const pickClick = (e: MouseEvent) => {
    const el = elementAt(doc, e.clientX, e.clientY);
    if (el) startDraft(el, e.clientX, e.clientY);
  };
  const pickWheel = (e: WheelEvent) => {
    const under = elementAt(doc, e.clientX, e.clientY);
    const box = scrollableAncestor(under, e.deltaX, e.deltaY);
    if (box) box.scrollBy(e.deltaX, e.deltaY);
    else win.scrollBy(e.deltaX, e.deltaY);
  };

  const save = async (form: NoteFields) => {
    if (!draft) return;
    const d = draft;
    await act(async () => {
      const { target, pageSource } = await describeTarget(d.el, {
        ...(d.selectedText ? { selectedText: d.selectedText } : {}),
        ...(backend.resolveFrames ? { serverResolve: backend.resolveFrames } : {})
      });
      await backend.add({ page: { url: doc.location.href, title: doc.title, ...(pageSource ? { source: pageSource } : {}) }, target, ...form });
      setDraft(null);
    });
  };

  // ---- Copy prompt (FR27-FR29) -------------------------------------------------------------
  const [prompt, setPrompt] = useState<{ text: string | null; refs: string[]; copied: boolean } | null>(null);
  const copyPrompt = async (includeSent: boolean) => {
    setCopyMenu(false);
    await act(async () => {
      const r = await backend.prompt({ detail: settings.detail, includeSent });
      const copied = r.prompt ? await copyToClipboard(doc, r.prompt) : false;
      setPrompt({ text: r.prompt, refs: r.refs, copied });
      setPanel('items');
    });
  };

  // ---- Webhook (FR31): only when the person presses Send ------------------------------------
  const [webhookNote, setWebhookNote] = useState<string | null>(null);
  const sendWebhook = async () => {
    const url = settings.webhookUrl;
    if (!url) return;
    await act(async () => {
      const r = await backend.prompt({ detail: settings.detail, includeSent: scope.includeSent });
      if (!r.prompt) { setWebhookNote('Nothing to send.'); return; }
      const sent = await backend.list();
      const body = JSON.stringify({ source: 'luci', prompt: r.prompt, items: sent.filter(i => r.refs.includes(i.ref)) });
      try {
        const res = await win.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        setWebhookNote(res.ok ? `Sent ${plural(r.refs.length, 'item')} to the webhook.` : `The webhook answered ${res.status}.`);
      } catch {
        // A webhook that does not allow this page's origin: send it anyway, without reading the answer
        await win.fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body });
        setWebhookNote(`Sent ${plural(r.refs.length, 'item')} (the webhook's answer cannot be read from this page).`);
      }
    });
  };

  // ---- Markers ------------------------------------------------------------------------------
  const markerPos = (item: FeedbackItem): { x: number; y: number; lost: boolean } | null => {
    let el: Element | null = null;
    try { el = doc.querySelector(item.target.selector); } catch { /* an odd selector */ }
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.right, y: r.top, lost: false };
    }
    const rect = item.target.rect;
    return rect ? { x: rect.x + rect.width - win.scrollX, y: rect.y - win.scrollY, lost: true } : null;
  };
  const open = items.find(i => i.ref === openRef) ?? null;

  const hoverRect = annotating && candidate && !draft ? candidate.getBoundingClientRect() : null;
  const innermost = annotating && candidate ? frameworkInfo(candidate)?.components.at(-1) : undefined;
  const hoverName = annotating && candidate ? `${nameOf(candidate)}${innermost ? ` · ${innermost}` : ''}` : '';

  return (
    <div class="luci luci-theme" data-theme={uiPrefs.theme} data-dock={uiPrefs.dock} style={{ '--marker': settings.markerColor, '--marker-ink': markerInk(settings.markerColor) }}>
      <div class="bar" role="toolbar" aria-label="Luci feedback">
        <button type="button" class="menu-btn" data-action="settings" aria-label="Menu and settings" aria-pressed={panel === 'settings'} data-tip="Menu"
          onClick={() => setPanel(p => (p === 'settings' ? null : 'settings'))}><LuciLogo size={48} /></button>
        {props.modes && <ModeSwitch {...props.modes} />}
        <span class="bar-sep" aria-hidden="true" />
        <Button icon={IconAnnotate} aria-pressed={annotating} data-action="annotate" title="Click an element to leave a note. Or select text. Esc stops." onClick={() => { setAnnotating(a => !a); setCandidate(null); setDraft(null); }}>Annotate</Button>
        <span class="split">
          <Button icon={IconCopy} data-action="copy-prompt" disabled={!scope.count}
            title={!scope.count ? 'No notes to send' : scope.includeSent ? 'Copy every open note as one prompt. All were sent before.' : 'Copy the new notes as one prompt'}
            onClick={() => void copyPrompt(scope.includeSent)}>Copy prompt{scope.count ? ` (${scope.label})` : ''}</Button>
          <button type="button" class="caret" data-action="copy-menu" aria-label="Choose what to copy" aria-expanded={copyMenu} disabled={!openCount} onClick={() => setCopyMenu(m => !m)}>▾</button>
        </span>
        <button type="button" aria-pressed={panel === 'items'} data-action="items" onClick={() => { setPanel(p => (p === 'items' ? null : 'items')); setPrompt(null); }}>Notes ({items.length})</button>
        <Button icon={IconPause} aria-pressed={paused} data-action="pause" title="Freeze the page's animations to annotate one frame" onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</Button>
        {backend.kind === 'project' || !props.onConnect ? (
          <span class={`conn ${backend.kind}`} data-part="connection" title={backend.kind === 'project' ? 'Notes are saved in the project, where your agent reads them' : props.connectNote ?? ''}>
            {backend.kind === 'project' ? 'Project' : 'This browser'}
          </span>
        ) : (
          <button type="button" class={`conn ${backend.kind}`} data-part="connection" data-action="connect" title={props.connectNote ?? ''} disabled={checking}
            onClick={() => { setChecking(true); void props.onConnect!().then(why => { setChecking(false); setError(why); }); }}>
            {checking ? <><ButtonSpinner />Checking…</> : 'This browser'}
          </button>
        )}
        <Button iconOnly size="lg" class="tool" icon={IconClose} label="Close Luci" data-action="close" onClick={props.onClose} />
      </div>

      {copyMenu && (
        <div class="menu" role="menu" data-part="copy-menu">
          <button type="button" role="menuitem" data-copy="new" disabled={!fresh} onClick={() => void copyPrompt(false)}>
            Only new notes ({fresh})<span class="dim">Notes not sent to the agent yet</span>
          </button>
          <button type="button" role="menuitem" data-copy="open" disabled={!openCount} onClick={() => void copyPrompt(true)}>
            All notes not done ({openCount})<span class="dim">Sends earlier notes again too</span>
          </button>
        </div>
      )}

      {annotating && !draft && (
        <div class="sub" role="note" data-part="hint">
          <p class="hint">Click an element to leave a note. Esc stops. Then select text to note words.</p>
        </div>
      )}

      {annotating && !draft && (
        <div class="pick-layer" data-part="pick-layer"
          onPointerMove={pickMove} onClick={pickClick} onWheel={pickWheel}
          onPointerLeave={() => setCandidate(null)} />
      )}
      {hoverRect && (
        <>
          <div class="highlight" style={{ left: `${hoverRect.left}px`, top: `${hoverRect.top}px`, width: `${hoverRect.width}px`, height: `${hoverRect.height}px` }} />
          <div class="label" data-part="hover-label" style={{ left: `${hoverRect.left}px`, top: `${Math.max(0, hoverRect.top - 24)}px` }}>{hoverName}</div>
        </>
      )}

      {selection && !draft && (
        <button type="button" class="chip-add btn-primary" data-action="add-selection" style={popAt(win, selection.x, selection.y - 8)}
          onClick={() => startDraft(selection.el, selection.x, selection.y, selection.text)}>Add feedback</button>
      )}

      {here.map(item => {
        const pos = markerPos(item);
        if (!pos) return null;
        const n = parseRef(item.ref)?.n;
        return (
          <button type="button" class={`marker ${shownStatus(item.status)}${pos.lost ? ' lost' : ''}`} data-marker={item.ref} data-status={shownStatus(item.status)}
            title={`${item.ref}: ${STATUS_TEXT[shownStatus(item.status)]}`} style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
            onClick={() => { setOpenRef(r => (r === item.ref ? null : item.ref)); setDraft(null); }}>
            {n}{STATUS_MARK[shownStatus(item.status)]}
          </button>
        );
      })}

      {draft && (
        <div class="pop" role="dialog" aria-label="New feedback" data-part="note-form" style={popAt(win, draft.at.x, draft.at.y)}>
          <h3>{draft.selectedText ? 'Feedback on the selected text' : `Feedback on ${nameOf(draft.el)}`}</h3>
          {draft.selectedText && <p class="quote" data-part="selected">“{draft.selectedText}”</p>}
          <NoteForm key={`${draft.at.x},${draft.at.y}`} submitLabel="Save" onSubmit={save} onCancel={() => setDraft(null)} />
        </div>
      )}

      {open && (() => {
        const pos = markerPos(open);
        return (
          <div class="pop" role="dialog" aria-label={`Note ${open.ref}`} data-part="item" data-ref={open.ref} style={popAt(win, pos?.x ?? 24, pos?.y ?? 24)}>
            <NoteDetails key={open.ref} item={open} backend={backend} act={act} onClose={() => setOpenRef(null)} />
          </div>
        );
      })()}

      {panel === 'items' && (
        <div class="panel" role="dialog" aria-label="Feedback notes" data-part="items">
          {prompt ? (
            <>
              <h2>{prompt.text ? `Prompt with ${plural(prompt.refs.length, 'note')}` : 'Nothing to send'}</h2>
              {prompt.text ? (
                <>
                  <p class="hint" data-part="copied">{prompt.copied ? 'Copied. Paste it to your agent.' : 'Copy it below. Paste it to your agent.'}
                    {backend.kind === 'project' ? ' Your agent can also fetch it with get_feedback_prompt.' : ''} These notes are now marked as sent.</p>
                  <pre data-part="prompt">{prompt.text}</pre>
                </>
              ) : (
                <p class="hint">Every note is done.</p>
              )}
              <div class="row"><button type="button" data-action="prompt-back" onClick={() => setPrompt(null)}>Back to the notes</button></div>
            </>
          ) : (
            <NotesPanel items={items} route={route} backend={backend} act={act} scope={scope}
              onCopy={() => void copyPrompt(scope.includeSent)} onShow={ref => { setPanel(null); setOpenRef(ref); }}
              webhook={settings.webhookUrl ? { send: () => void sendWebhook(), note: webhookNote } : null} />
          )}
        </div>
      )}

      {panel === 'settings' && <SettingsPanel settings={settings} onChange={changeSettings} uiPrefs={uiPrefs} onUiPrefsChange={setUiPrefs} count={items.length} onClearAll={() => void act(() => backend.clear('all'))} />}

      {error && (
        <div class="sub" role="alert" data-part="error" style={{ top: 'auto', bottom: '12px', left: '12px', right: 'auto' }}>
          <p class="error">{error}</p>
          <div class="row"><button type="button" onClick={() => setError(null)}>Dismiss</button></div>
        </div>
      )}
    </div>
  );
}

/** The note's text, intent and priority: for a new note, and to edit one already saved. */
function NoteForm(props: { initial?: NoteFields; submitLabel: string; onSubmit: (f: NoteFields) => Promise<void>; onCancel: () => void }) {
  const [comment, setComment] = useState(props.initial?.comment ?? '');
  const [intent, setIntent] = useState<FeedbackIntent>(props.initial?.intent ?? 'fix');
  const [priority, setPriority] = useState<FeedbackPriority>(props.initial?.priority ?? 'medium');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    await props.onSubmit({ comment: comment.trim(), intent, priority });
    setBusy(false);
  };
  return (
    <>
      <textarea ref={ref} data-part="comment" placeholder="What should change?" value={comment}
        onInput={e => setComment((e.currentTarget as HTMLTextAreaElement).value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }} />
      <div class="row">
        <label>Intent <select data-part="intent" value={intent} onChange={e => setIntent((e.currentTarget as HTMLSelectElement).value as FeedbackIntent)}>
          {FEEDBACK_INTENTS.map(i => <option value={i}>{i}</option>)}
        </select></label>
        <label>Priority <select data-part="priority" value={priority} onChange={e => setPriority((e.currentTarget as HTMLSelectElement).value as FeedbackPriority)}>
          {FEEDBACK_PRIORITIES.map(p => <option value={p}>{p}</option>)}
        </select></label>
      </div>
      <div class="row">
        <button type="button" class="btn-primary" data-action="save-note" disabled={!comment.trim() || busy} onClick={() => void submit()}>{busy ? <><ButtonSpinner />Saving…</> : props.submitLabel}</button>
        <button type="button" data-action="cancel-note" onClick={props.onCancel}>Cancel</button>
      </div>
    </>
  );
}

/** One note: what it says and its status; mark it done or reopen it, edit it (text, intent, priority), delete it. */
function NoteDetails(props: { item: FeedbackItem; backend: FeedbackBackend; act: Act; onClose?: () => void; inList?: boolean }) {
  const { item, backend, act } = props;
  const [editing, setEditing] = useState(false);
  const shown = shownStatus(item.status);
  const done = shown === 'done';
  if (editing) {
    return (
      <div class="stack" data-part="edit-note">
        <h3>Edit {item.ref}</h3>
        <NoteForm initial={item} submitLabel="Save changes"
          onSubmit={f => act(async () => { await backend.change(item.ref, { action: 'edit', ...f }); setEditing(false); })}
          onCancel={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <div class="stack details">
      {/* In the list, the row above already shows the ref, status and text */}
      {!props.inList && <h3>{item.ref} <span class={`status ${shown}`} data-part="status">{STATUS_TEXT[shown]}</span></h3>}
      {!props.inList && <p class="meta" data-part="note-meta">{item.intent} · {item.priority} priority · {item.target.element}</p>}
      {!props.inList && <p data-part="comment-text" class="comment">{item.comment}</p>}
      <p class="meta" data-part="note-source">
        {props.inList ? `On ${item.target.element}` : 'In'}{item.target.source ? <> · <code>{sourceText(item.target.source)}</code></> : ''}
        {item.target.components?.length ? ` · ${item.target.components.slice(-3).join(' › ')}` : ''}
      </p>
      {item.target.selectedText && <p class="quote">“{item.target.selectedText}”</p>}
      {/* From the earlier agent sync, on older notes */}
      {item.resolution && <p class="dim" data-part="resolution">Agent's note: {item.resolution}</p>}
      {item.thread.length > 0 && (
        <ul class="thread" data-part="thread">
          {item.thread.map(m => <li class={m.from}>{m.from === 'agent' ? 'Agent: ' : 'You: '}{m.text}</li>)}
        </ul>
      )}
      <div class="row">
        {done
          ? <button type="button" data-action="reopen" onClick={() => void act(() => backend.change(item.ref, { action: 'reopen' }))}>Reopen</button>
          : <button type="button" class="btn-primary" data-action="mark-done" title="You checked the agent's work: this note is done" onClick={() => void act(() => backend.change(item.ref, { action: 'done' }))}>Mark done</button>}
        <button type="button" data-action="edit" onClick={() => setEditing(true)}>Edit</button>
        <button class="btn-danger" type="button" data-action="delete" onClick={() => void act(async () => { await backend.remove(item.ref); props.onClose?.(); })}>Delete</button>
        {props.onClose && <button type="button" data-action="close-item" onClick={props.onClose}>Close</button>}
      </div>
    </div>
  );
}

type Tab = 'open' | 'done' | 'all';

/** Notes, page by page: tabs for not done / done / all; a row per note; open one to mark it done, edit or delete it. */
function NotesPanel(props: {
  items: FeedbackItem[]; route: string; backend: FeedbackBackend; act: Act; scope: ReturnType<typeof copyScope>;
  onCopy: () => void; onShow: (ref: string) => void; webhook: { send: () => void; note: string | null } | null;
}) {
  const [tab, setTab] = useState<Tab>('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const done = props.items.filter(i => !isOpen(i));
  const open = props.items.filter(isOpen);
  const copied = props.items.filter(isCopied);
  const shown = tab === 'open' ? open : tab === 'done' ? done : props.items;
  const pages = new Map<number, FeedbackItem[]>();
  for (const i of shown) {
    const p = parseRef(i.ref)?.page ?? 0;
    pages.set(p, [...(pages.get(p) ?? []), i]);
  }
  const allPages = new Set(props.items.map(i => parseRef(i.ref)?.page)).size;
  return (
    <>
      <h2>Notes: {plural(props.items.length, 'note')} on {plural(allPages, 'page')}</h2>
      <div class="seg tabs" role="tablist" aria-label="Which notes">
        {([['open', `Not done (${open.length})`], ['done', `Done (${done.length})`], ['all', `All (${props.items.length})`]] as const).map(([id, label]) => (
          <button type="button" role="tab" data-tab={id} aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {!props.items.length && <EmptyState title={COPY.feedback.notesEmpty.title} body={COPY.feedback.notesEmpty.body} part="notes-empty" />}
      {props.items.length > 0 && !shown.length && <p class="hint">{tab === 'open' ? 'Every note is done.' : 'No notes are done yet.'}</p>}
      <div class="notes-scroll">
        {[...pages.entries()].map(([page, list]) => (
          <section class="page-group" data-page={page}>
            <h3><span>Page {page}</span> <code>{list[0]!.page.route}</code>{list[0]!.page.route === props.route ? <span class="here">this page</span> : null}<span class="count">{plural(list.length, 'note')}</span></h3>
            <ul class="notes">
              {list.map(i => (
                <li data-item={i.ref} class={expanded === i.ref ? 'expanded' : ''}>
                  <button type="button" class="row-main" data-item-open aria-expanded={expanded === i.ref} onClick={() => setExpanded(e => (e === i.ref ? null : i.ref))}>
                    <span class={`dot marker-like ${shownStatus(i.status)}`} aria-hidden="true">{parseRef(i.ref)?.n}{STATUS_MARK[shownStatus(i.status)]}</span>
                    <span class="body">
                      <span class="comment">{i.comment}</span>
                      <span class="meta">{i.ref} · {i.intent} · {i.priority}{i.layout ? ' · layout' : ''} · <span class={`status ${shownStatus(i.status)}`}>{STATUS_TEXT[shownStatus(i.status)]}</span></span>
                    </span>
                  </button>
                  {expanded === i.ref && (
                    <div class="row-details">
                      <NoteDetails item={i} backend={props.backend} act={props.act} inList />
                      {i.page.route === props.route
                        ? <button type="button" class="link-button" data-action="show-on-page" onClick={() => props.onShow(i.ref)}>Show on the page</button>
                        : <a class="link" href={i.page.url} data-action="open-page">Go to {i.page.route}</a>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div class="row footer">
        <button type="button" class="btn-primary" data-action="copy-prompt-panel" disabled={!props.scope.count} onClick={props.onCopy}>Copy prompt{props.scope.count ? ` (${props.scope.label})` : ''}</button>
        {props.webhook && <button type="button" data-action="send-webhook" disabled={!props.scope.count} onClick={props.webhook.send}>Send to webhook</button>}
        <button type="button" data-action="mark-copied-done" disabled={!copied.length} title="You checked the agent's work on every copied note"
          onClick={() => void props.act(async () => { for (const i of copied) await props.backend.change(i.ref, { action: 'done' }); })}>Mark all copied as done ({copied.length})</button>
        <button class="btn-danger" type="button" data-action="clear-done" disabled={!done.length} title="Delete the notes that are done" onClick={() => void props.act(() => props.backend.clear('done'))}>Clear done ({done.length})</button>
      </div>
      {props.webhook?.note && <p class="dim" data-part="webhook-note">{props.webhook.note}</p>}
    </>
  );
}

function SettingsPanel(props: { settings: FeedbackSettings; onChange: (s: FeedbackSettings) => void; uiPrefs: UiPrefs; onUiPrefsChange: (patch: Partial<UiPrefs>) => void; count: number; onClearAll: () => void }) {
  const s = props.settings;
  const [hook, setHook] = useState(s.webhookUrl ?? '');
  const [confirm, setConfirm] = useState(false);
  const validHook = !hook || /^https?:\/\/\S+$/.test(hook);
  return (
    <div class="panel" role="dialog" aria-label="Feedback settings" data-part="settings">
      <h2>Settings</h2>
      <AppearanceControls prefs={props.uiPrefs} onChange={props.onUiPrefsChange} />
      <hr class="settings-divider" />
      <div class="stack">
        <span>Marker color</span>
        <div class="swatches" role="group" aria-label="Marker color">
          {MARKER_COLORS.map(c => <button type="button" aria-label={c} aria-pressed={s.markerColor === c} data-color={c} style={{ background: c }} onClick={() => props.onChange({ ...s, markerColor: c })} />)}
        </div>
      </div>
      <label>Prompt detail <select data-part="detail" value={s.detail} onChange={e => props.onChange({ ...s, detail: (e.currentTarget as HTMLSelectElement).value as DetailLevel })}>
        {DETAIL_LEVELS.map(d => <option value={d}>{d}</option>)}
      </select></label>
      <p class="dim">compact: selector and text. standard: + source file and components. detailed: + computed styles.</p>
      <div class="stack">
        <span>Webhook (optional)</span>
        <input type="url" class="field" data-part="webhook" placeholder="https://..." value={hook}
          onInput={e => setHook((e.currentTarget as HTMLInputElement).value.trim())} />
        <div class="row">
          <button type="button" data-action="save-webhook" disabled={!validHook} onClick={() => { const { webhookUrl: _w, ...rest } = s; props.onChange(hook ? { ...rest, webhookUrl: hook } : rest); }}>Save webhook</button>
          <span class="dim">Sent only when you press Send to webhook.</span>
        </div>
      </div>
      <div class="row danger">
        {confirm
          ? <button class="btn-danger" type="button" data-action="clear-all-confirm" onClick={() => { setConfirm(false); props.onClearAll(); }}>Yes, delete all {props.count} notes</button>
          : <button class="btn-danger" type="button" data-action="clear-all" disabled={!props.count} onClick={() => setConfirm(true)}>Delete all notes…</button>}
      </div>
    </div>
  );
}
