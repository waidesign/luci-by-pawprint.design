/**
 * The Feedback layer of the dev toolbar (FR23-FR31): annotate an element (click) or a text selection,
 * with intent and priority; numbered markers show each item's status on the page; the items panel
 * copies the page-grouped prompt and marks what it sent; settings for the marker color and the
 * prompt's detail level; pause animations to annotate one frame. Items live in a FeedbackBackend.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { elementAt, isLuciUi, scrollableAncestor } from '@luci/capture';
import {
  DETAIL_LEVELS,
  FEEDBACK_INTENTS,
  FEEDBACK_PRIORITIES,
  parseRef,
  routeOf,
  type DetailLevel,
  type FeedbackIntent,
  type FeedbackItem,
  type FeedbackPriority
} from '@luci/format/feedback';
import type { FeedbackBackend } from '../backend.js';
import { reactInfo } from '../react.js';
import { describeTarget, nameOf, selectionElement } from '../target.js';

export interface FeedbackSettings {
  markerColor: string;
  detail: DetailLevel;
  /** Where "Send to webhook" posts the prompt; nothing is sent until the person presses it. */
  webhookUrl?: string;
}
export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = { markerColor: '#a78bfa', detail: 'standard' };
export const MARKER_COLORS = ['#a78bfa', '#f472b6', '#38bdf8', '#4ade80', '#fb923c'] as const;

export interface FeedbackProps {
  doc: Document;
  backend: FeedbackBackend;
  /** Shown in the bar: how to keep items in the project when they are only in this browser. */
  connectNote?: string;
  settings: FeedbackSettings;
  onSettingsChange?: (settings: FeedbackSettings) => void;
  /** Switch to the capture tools. */
  onCapture?: () => void;
  /** Look for `luci serve` again (the badge becomes a button); resolves null when connected, else why not. */
  onConnect?: () => Promise<string | null>;
  onClose: () => void;
  /** How often to look for the agent's changes (project only). Default 2000ms. */
  pollMs?: number;
}

const STATUS_TEXT: Readonly<Record<FeedbackItem['status'], string>> = {
  pending: 'Not sent yet', sent: 'Sent to the agent', acknowledged: 'The agent is on it', question: 'The agent asked a question',
  resolved: 'Done', dismissed: 'Not done'
};
const STATUS_MARK: Readonly<Record<FeedbackItem['status'], string>> = { pending: '', sent: '', acknowledged: '…', question: '?', resolved: '✓', dismissed: '–' };

interface Draft {
  el: Element;
  selectedText?: string;
  at: { x: number; y: number };
}

/** Where a popover goes: below the point, kept inside the window. */
const popAt = (win: Window, x: number, y: number) => ({
  left: `${Math.max(12, Math.min(x, win.innerWidth - 352))}px`,
  top: `${Math.max(12, Math.min(y + 12, win.innerHeight - 280))}px`
});

/** Copy text: the clipboard API, or a selected textarea when the page does not allow it. */
async function copyToClipboard(doc: Document, text: string): Promise<boolean> {
  try {
    await doc.defaultView!.navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('data-luci-ui', '');
    ta.style.cssText = 'position:fixed;left:-9999px';
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** The CSS that freezes a page for annotating one frame (FR31). */
export const PAUSE_CSS = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }';

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
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Items load at start; in the project, the agent's changes show up within a poll
  useEffect(() => {
    void reload();
    if (backend.kind !== 'project') return;
    const timer = setInterval(() => void reload(), props.pollMs ?? 2000);
    return () => clearInterval(timer);
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

  // Esc: closes the form, then leaves annotate mode
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draft) setDraft(null);
      else if (openRef) setOpenRef(null);
      else if (annotating) { setAnnotating(false); setCandidate(null); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [draft, openRef, annotating]);

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
  const pending = items.filter(i => i.status === 'pending').length;

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

  const save = async (form: { comment: string; intent: FeedbackIntent; priority: FeedbackPriority }) => {
    if (!draft) return;
    const d = draft;
    await act(async () => {
      const { target, pageSource } = await describeTarget(d.el, d.selectedText ? { selectedText: d.selectedText } : {});
      await backend.add({ page: { url: doc.location.href, title: doc.title, ...(pageSource ? { source: pageSource } : {}) }, target, ...form });
      setDraft(null);
    });
  };

  // ---- Copy prompt (FR27-FR29) -------------------------------------------------------------
  const [prompt, setPrompt] = useState<{ text: string | null; refs: string[]; copied: boolean } | null>(null);
  const [includeSent, setIncludeSent] = useState(false);
  const copyPrompt = async (withSent = includeSent) => {
    await act(async () => {
      const r = await backend.prompt({ detail: settings.detail, includeSent: withSent });
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
      const r = await backend.prompt({ detail: settings.detail, includeSent });
      if (!r.prompt) { setWebhookNote('Nothing new to send.'); return; }
      const sent = await backend.list();
      const body = JSON.stringify({ source: 'luci', prompt: r.prompt, items: sent.filter(i => r.refs.includes(i.ref)) });
      try {
        const res = await win.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        setWebhookNote(res.ok ? `Sent ${r.refs.length} item${r.refs.length === 1 ? '' : 's'} to the webhook.` : `The webhook answered ${res.status}.`);
      } catch {
        // A webhook that does not allow this page's origin: send it anyway, without reading the answer
        await win.fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body });
        setWebhookNote(`Sent ${r.refs.length} item${r.refs.length === 1 ? '' : 's'} (the webhook's answer cannot be read from this page).`);
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
  const hoverName = annotating && candidate ? `${nameOf(candidate)}${reactInfo(candidate)?.components.at(-1) ? ` · ${reactInfo(candidate)!.components.at(-1)}` : ''}` : '';

  return (
    <div class="luci" style={{ '--marker': settings.markerColor }}>
      <div class="bar" role="toolbar" aria-label="Luci feedback">
        <span class="brand">Luci</span>
        <button type="button" aria-pressed={annotating} data-action="annotate" title="Click elements on the page to leave a note (Esc to stop). Or select text." onClick={() => { setAnnotating(a => !a); setCandidate(null); setDraft(null); }}>Annotate</button>
        <button type="button" data-action="copy-prompt" disabled={!pending} title="Copy the new items as one prompt for your agent" onClick={() => void copyPrompt(false)}>Copy prompt{pending ? ` (${pending})` : ''}</button>
        <button type="button" aria-pressed={panel === 'items'} data-action="items" onClick={() => { setPanel(p => (p === 'items' ? null : 'items')); setPrompt(null); }}>Items ({items.length})</button>
        <button type="button" aria-pressed={paused} data-action="pause" title="Pause animations to annotate one frame" onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" aria-pressed={panel === 'settings'} data-action="settings" aria-label="Settings" title="Settings" onClick={() => setPanel(p => (p === 'settings' ? null : 'settings'))}>⚙</button>
        {props.onCapture && <button type="button" data-action="capture" title="Capture tools: component, text, color, spacing" onClick={props.onCapture}>Capture</button>}
        {backend.kind === 'project' || !props.onConnect ? (
          <span class={`conn ${backend.kind}`} data-part="connection" title={backend.kind === 'project' ? 'Items are saved in the project, where your agent reads them' : props.connectNote ?? ''}>
            {backend.kind === 'project' ? 'Project' : 'This browser'}
          </span>
        ) : (
          <button type="button" class={`conn ${backend.kind}`} data-part="connection" data-action="connect" title={props.connectNote ?? ''}
            onClick={() => void props.onConnect!().then(why => setError(why))}>This browser</button>
        )}
        <button type="button" aria-label="Close Luci" data-action="close" onClick={props.onClose}>×</button>
      </div>

      {annotating && !draft && (
        <div class="sub" role="note" data-part="hint">
          <p class="hint">Click an element to leave a note. Select text (after Esc) to comment on words. Esc stops.</p>
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
        <button type="button" class="chip-add primary" data-action="add-selection" style={popAt(win, selection.x, selection.y - 8)}
          onClick={() => startDraft(selection.el, selection.x, selection.y, selection.text)}>Add feedback</button>
      )}

      {here.map(item => {
        const pos = markerPos(item);
        if (!pos) return null;
        const n = parseRef(item.ref)?.n;
        return (
          <button type="button" class={`marker ${item.status}${pos.lost ? ' lost' : ''}`} data-marker={item.ref} data-status={item.status}
            title={`${item.ref}: ${STATUS_TEXT[item.status]}`} style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
            onClick={() => { setOpenRef(r => (r === item.ref ? null : item.ref)); setDraft(null); }}>
            {n}{STATUS_MARK[item.status]}
          </button>
        );
      })}

      {draft && <NoteForm key={`${draft.at.x},${draft.at.y}`} draft={draft} win={win} onSave={save} onCancel={() => setDraft(null)} />}

      {open && (() => {
        const pos = markerPos(open);
        return <ItemPopover item={open} style={popAt(win, pos?.x ?? 24, pos?.y ?? 24)} backend={backend} act={act} onClose={() => setOpenRef(null)} />;
      })()}

      {panel === 'items' && (
        <div class="panel" role="dialog" aria-label="Feedback items" data-part="items">
          {prompt ? (
            <>
              <h2>{prompt.text ? `Prompt with ${prompt.refs.length} item${prompt.refs.length === 1 ? '' : 's'}` : 'Nothing new to send'}</h2>
              {prompt.text ? (
                <>
                  <p class="hint" data-part="copied">{prompt.copied ? 'Copied. Paste it to your agent.' : 'Copy it from below and paste it to your agent.'}
                    {backend.kind === 'project' ? ' Your agent can also fetch it with get_feedback_prompt.' : ''} These items are now marked as sent.</p>
                  <pre data-part="prompt">{prompt.text}</pre>
                </>
              ) : (
                <p class="hint">Every item was sent already. Copy them again with "Include items already sent".</p>
              )}
              <div class="row"><button type="button" data-action="prompt-back" onClick={() => setPrompt(null)}>Back to the items</button></div>
            </>
          ) : (
            <ItemsList items={items} route={route} backend={backend} act={act} onOpen={(ref) => { setPanel(null); setOpenRef(ref); }}
              detail={settings.detail} includeSent={includeSent} setIncludeSent={setIncludeSent} onCopy={() => void copyPrompt()}
              webhook={settings.webhookUrl ? { send: () => void sendWebhook(), note: webhookNote } : null} />
          )}
        </div>
      )}

      {panel === 'settings' && <SettingsPanel settings={settings} onChange={changeSettings} />}

      {error && (
        <div class="sub" role="alert" data-part="error" style={{ top: 'auto', bottom: '12px', left: '12px', right: 'auto' }}>
          <p class="error">{error}</p>
          <div class="row"><button type="button" onClick={() => setError(null)}>Dismiss</button></div>
        </div>
      )}
    </div>
  );
}

function NoteForm(props: { draft: Draft; win: Window; onSave: (f: { comment: string; intent: FeedbackIntent; priority: FeedbackPriority }) => Promise<void>; onCancel: () => void }) {
  const [comment, setComment] = useState('');
  const [intent, setIntent] = useState<FeedbackIntent>('fix');
  const [priority, setPriority] = useState<FeedbackPriority>('medium');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    await props.onSave({ comment: comment.trim(), intent, priority });
    setBusy(false);
  };
  return (
    <div class="pop" role="dialog" aria-label="New feedback" data-part="note-form" style={popAt(props.win, props.draft.at.x, props.draft.at.y)}>
      <h3>{props.draft.selectedText ? 'Feedback on the selected text' : `Feedback on ${nameOf(props.draft.el)}`}</h3>
      {props.draft.selectedText && <p class="quote" data-part="selected">“{props.draft.selectedText}”</p>}
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
        <button type="button" class="primary" data-action="save-note" disabled={!comment.trim() || busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" data-action="cancel-note" onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ItemPopover(props: { item: FeedbackItem; style: Record<string, string>; backend: FeedbackBackend; act: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void }) {
  const { item, backend, act } = props;
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(item.comment);
  const done = item.status === 'resolved' || item.status === 'dismissed';
  return (
    <div class="pop" role="dialog" aria-label={`Feedback ${item.ref}`} data-part="item" data-ref={item.ref} style={props.style}>
      <h3>{item.ref} · {item.intent}, {item.priority} <span class={`status ${item.status}`} data-part="status">{STATUS_TEXT[item.status]}</span></h3>
      {editing ? (
        <textarea data-part="edit-comment" value={comment} onInput={e => setComment((e.currentTarget as HTMLTextAreaElement).value)} />
      ) : (
        <p data-part="comment-text" style={{ margin: 0 }}>{item.comment}</p>
      )}
      {item.target.selectedText && <p class="quote">“{item.target.selectedText}”</p>}
      {item.resolution && <p class="dim" data-part="resolution">{item.status === 'resolved' ? 'Done: ' : 'Not done: '}{item.resolution}</p>}
      {item.thread.length > 0 && (
        <ul class="thread" data-part="thread">
          {item.thread.map(m => <li class={m.from}>{m.from === 'agent' ? 'Agent: ' : 'You: '}{m.text}</li>)}
        </ul>
      )}
      {item.status === 'question' && (
        <div class="stack">
          <textarea data-part="answer" placeholder="Your answer" value={answer} onInput={e => setAnswer((e.currentTarget as HTMLTextAreaElement).value)} />
          <div class="row"><button type="button" class="primary" data-action="answer" disabled={!answer.trim()} onClick={() => void act(() => backend.change(item.ref, { action: 'answer', text: answer.trim() }))}>Answer</button></div>
        </div>
      )}
      <div class="row">
        {editing
          ? <button type="button" class="primary" data-action="save-edit" disabled={!comment.trim()} onClick={() => void act(async () => { await backend.change(item.ref, { action: 'edit', comment: comment.trim() }); setEditing(false); })}>Save</button>
          : <button type="button" data-action="edit" onClick={() => setEditing(true)}>Edit</button>}
        {done && <button type="button" data-action="reopen" onClick={() => void act(() => backend.change(item.ref, { action: 'reopen' }))}>Reopen</button>}
        <button type="button" data-action="delete" onClick={() => void act(async () => { await backend.remove(item.ref); props.onClose(); })}>Delete</button>
        <button type="button" data-action="close-item" onClick={props.onClose}>Close</button>
      </div>
    </div>
  );
}

function ItemsList(props: {
  items: FeedbackItem[]; route: string; backend: FeedbackBackend; act: (fn: () => Promise<unknown>) => Promise<void>; onOpen: (ref: string) => void;
  detail: DetailLevel; includeSent: boolean; setIncludeSent: (v: boolean) => void; onCopy: () => void;
  webhook: { send: () => void; note: string | null } | null;
}) {
  const [confirm, setConfirm] = useState(false);
  const pages = new Map<number, FeedbackItem[]>();
  for (const i of props.items) {
    const p = parseRef(i.ref)?.page ?? 0;
    pages.set(p, [...(pages.get(p) ?? []), i]);
  }
  const toSend = props.items.filter(i => (props.includeSent ? ['pending', 'sent', 'acknowledged', 'question'].includes(i.status) : i.status === 'pending')).length;
  return (
    <>
      <h2>Feedback: {props.items.length} item{props.items.length === 1 ? '' : 's'} on {pages.size} page{pages.size === 1 ? '' : 's'}</h2>
      {!props.items.length && <p class="hint">No feedback yet. Press Annotate and click an element, or select text on the page.</p>}
      <div style={{ overflow: 'auto' }}>
        {[...pages.entries()].map(([page, list]) => (
          <div class="page-group" data-page={page}>
            <h3>Page {page}: {list[0]!.page.route}{list[0]!.page.route === props.route ? ' (this page)' : ''}</h3>
            <ul class="items fb-items">
              {list.map(i => (
                <li data-item={i.ref}>
                  <span class="ref">{i.ref}</span>
                  <span>{i.comment} <span class={`status ${i.status}`}>{STATUS_TEXT[i.status]}</span></span>
                  <span class="row">
                    {i.page.route === props.route && <button type="button" data-item-open onClick={() => props.onOpen(i.ref)}>Show</button>}
                    <button type="button" data-item-remove aria-label={`Delete ${i.ref}`} onClick={() => void props.act(() => props.backend.remove(i.ref))}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div class="row">
        <button type="button" class="primary" data-action="copy-prompt-panel" disabled={!toSend} onClick={props.onCopy}>Copy prompt ({toSend})</button>
        <label><input type="checkbox" data-part="include-sent" checked={props.includeSent} onChange={e => props.setIncludeSent((e.currentTarget as HTMLInputElement).checked)} /> Include items already sent</label>
        <span class="dim">Detail: {props.detail}</span>
      </div>
      {props.webhook && (
        <div class="row">
          <button type="button" data-action="send-webhook" disabled={!toSend} onClick={props.webhook.send}>Send to webhook</button>
          {props.webhook.note && <span class="dim" data-part="webhook-note">{props.webhook.note}</span>}
        </div>
      )}
      {props.items.length > 0 && (
        <div class="row">
          <button type="button" data-action="clear-done" onClick={() => void props.act(() => props.backend.clear('done'))}>Clear done</button>
          {confirm
            ? <button type="button" data-action="clear-all-confirm" onClick={() => { setConfirm(false); void props.act(() => props.backend.clear('all')); }}>Yes, delete every item</button>
            : <button type="button" data-action="clear-all" onClick={() => setConfirm(true)}>Clear all</button>}
        </div>
      )}
    </>
  );
}

function SettingsPanel(props: { settings: FeedbackSettings; onChange: (s: FeedbackSettings) => void }) {
  const s = props.settings;
  const [hook, setHook] = useState(s.webhookUrl ?? '');
  const validHook = !hook || /^https?:\/\/\S+$/.test(hook);
  return (
    <div class="panel" role="dialog" aria-label="Feedback settings" data-part="settings">
      <h2>Settings</h2>
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
        <input type="url" data-part="webhook" placeholder="https://..." value={hook} style={{ font: 'inherit', color: 'inherit', background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', padding: '4px 6px' }}
          onInput={e => setHook((e.currentTarget as HTMLInputElement).value.trim())} />
        <div class="row">
          <button type="button" data-action="save-webhook" disabled={!validHook} onClick={() => { const { webhookUrl: _w, ...rest } = s; props.onChange(hook ? { ...rest, webhookUrl: hook } : rest); }}>Save webhook</button>
          <span class="dim">Items go there only when you press "Send to webhook".</span>
        </div>
      </div>
    </div>
  );
}
