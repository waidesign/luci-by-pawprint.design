/**
 * Team Feedback — Reviewer side (Chrome extension on any URL).
 *
 * Click-and-note feedback for PMs, clients, stakeholders and designers:
 * - Simple mode by default (click & note only; capture tools and CSS values hidden).
 * - Switch to Full toolbar anytime to access Capture alongside Reviewer.
 * - First-use identity (name + role), stored locally in extension storage, editable in Settings.
 * - Multi-page notes persisted per site origin so reloads and navigation never lose them.
 * - Review panel shows notes grouped by page plus an editable text box and Copy review button
 *   (never a paste box). Text only: no screenshots, no page code, no network requests.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AppearanceControls,
  LuciLogo,
  ModeSwitch,
  elementAt,
  parentOf,
  querySelectorDeep,
  scrollableAncestor,
  selectorFor,
  touchScreen,
  useUiPrefs,
  type ModeSwitchProps
} from '@luci-dev/capture';
import {
  REVIEWER_ROLES,
  formatTeamReview,
  normalizeReviewPath,
  routeOf,
  type ReviewAnchor,
  type ReviewMeasurements,
  type ReviewNote,
  type ReviewerIdentity,
  type ReviewerRole,
  type TeamReview
} from '@luci-dev/format/feedback';
import { cleanSource, formatColor, isTransparent } from '@luci-dev/format/capture';
import {
  Button,
  EmptyState,
  IconAnnotate,
  IconCheck,
  IconClose,
  IconCopy,
  IconDelete,
  IconEdit,
  IconNotes,
  IconSuccess,
  Mascot,
  useShortcuts
} from '@luci-dev/ui';
import { frameworkInfo, nameOf, pointIn } from '../target.js';
import { copyToClipboard } from './clipboard.js';

export interface ReviewerStore {
  loadIdentity(): Promise<ReviewerIdentity | null>;
  saveIdentity(identity: ReviewerIdentity): Promise<void>;
  loadSimpleMode(): Promise<boolean>;
  saveSimpleMode(simple: boolean): Promise<void>;
  loadNotes(origin: string): Promise<ReviewNote[]>;
  saveNotes(origin: string, notes: ReviewNote[]): Promise<void>;
}

export function localStorageReviewerStore(prefix = 'luci.reviewer'): ReviewerStore {
  const read = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(`${prefix}.${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, val: unknown) => {
    try {
      localStorage.setItem(`${prefix}.${key}`, JSON.stringify(val));
    } catch {
      // ignore storage quota/sandbox errors
    }
  };
  return {
    async loadIdentity() { return read<ReviewerIdentity | null>('identity', null); },
    async saveIdentity(identity) { write('identity', identity); },
    async loadSimpleMode() { return read<boolean>('simpleMode', true); },
    async saveSimpleMode(simple) { write('simpleMode', simple); },
    async loadNotes(origin) {
      const map = read<Record<string, ReviewNote[]>>('notesByOrigin', {});
      return Array.isArray(map[origin]) ? map[origin]! : [];
    },
    async saveNotes(origin, notes) {
      const map = read<Record<string, ReviewNote[]>>('notesByOrigin', {});
      if (notes.length) map[origin] = notes;
      else delete map[origin];
      write('notesByOrigin', map);
    }
  };
}

function cleanReviewColor(value: string): string {
  if (!value || isTransparent(value)) return '';
  const c = formatColor(value, { colors: 'hex' });
  return c === 'transparent' ? '' : c;
}

function browserLabel(ua: string): string {
  const edg = /Edg\/(\d+)/.exec(ua);
  if (edg) return `Edge ${edg[1]}`;
  const chrome = /Chrome\/(\d+)/.exec(ua);
  if (chrome) return `Chrome ${chrome[1]}`;
  const firefox = /Firefox\/(\d+)/.exec(ua);
  if (firefox) return `Firefox ${firefox[1]}`;
  const safari = /Version\/(\d+).*Safari/.exec(ua);
  if (safari) return `Safari ${safari[1]}`;
  return 'Browser';
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const shorten = (text: string, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Silently capture anchors and computed measurements for an element (text only; no screenshots or HTML). */
export function captureReviewElement(el: Element, doc: Document, win: Window, at?: { x: number; y: number }): {
  anchor: ReviewAnchor;
  measured: ReviewMeasurements;
  path: string;
  url: string;
  viewport: string;
  browser: string;
} {
  const r = el.getBoundingClientRect();
  const docW = Math.max(doc.documentElement.scrollWidth || 0, win.innerWidth || 1);
  const docH = Math.max(doc.documentElement.scrollHeight || 0, win.innerHeight || 1);
  const cx = r.left + win.scrollX + r.width / 2;
  const cy = r.top + win.scrollY + r.height / 2;
  const xPct = Math.max(0, Math.min(100, Math.round((cx / docW) * 100)));
  const yPct = Math.max(0, Math.min(100, Math.round((cy / docH) * 100)));

  const rawText = collapse((el as HTMLElement).innerText ?? el.textContent ?? '');
  const text = rawText ? shorten(rawText, 80) : undefined;
  const component = frameworkInfo(el)?.components.at(-1);
  const selector = selectorFor(el, doc);
  const element = nameOf(el);

  const cs = win.getComputedStyle(el);
  const measured: ReviewMeasurements = {};
  const color = cleanReviewColor(cs.color);
  if (color) measured.color = color;
  const bg = cleanReviewColor(cs.backgroundColor);
  if (bg) measured.background = bg;
  const ff = cs.fontFamily?.split(',')[0]?.replace(/["']/g, '').trim();
  if (ff) measured.fontFamily = ff;
  if (cs.fontSize && cs.fontSize !== '0px') measured.fontSize = cs.fontSize;
  if (cs.fontWeight && cs.fontWeight !== 'normal') measured.fontWeight = cs.fontWeight;
  if (cs.padding && !/^0px(\s+0px)*$/.test(cs.padding)) measured.padding = cs.padding;
  if (cs.margin && !/^0px(\s+0px)*$/.test(cs.margin)) measured.margin = cs.margin;
  if (cs.gap && cs.gap !== 'normal' && !/^0px(\s+0px)*$/.test(cs.gap)) measured.gap = cs.gap;
  if (cs.borderRadius && !/^0px(\s+0px)*$/.test(cs.borderRadius)) measured.borderRadius = cs.borderRadius;

  const anchor: ReviewAnchor = {
    element,
    ...(text ? { text } : {}),
    ...(component ? { component } : {}),
    ...(selector ? { selector } : {}),
    position: [xPct, yPct],
    ...(at ? { point: pointIn(r, at) } : {})
  };

  return {
    anchor,
    measured,
    path: normalizeReviewPath(routeOf(doc.location.href)),
    url: cleanSource(doc.location.href),
    viewport: `${win.innerWidth}x${win.innerHeight}`,
    browser: browserLabel(win.navigator.userAgent)
  };
}

/** Plain label shown to a reviewer in Simple mode (no CSS selectors or styles). */
function plainElementLabel(el: Element): string {
  const base = nameOf(el).split(' ')[0] ?? el.tagName.toLowerCase();
  const txt = collapse((el as HTMLElement).innerText ?? el.textContent ?? '');
  if (!txt) return base;
  return `${base} "${shorten(txt, 36)}"`;
}

const popAt = (win: Window, x: number, y: number) => ({
  left: `${Math.max(12, Math.min(x, win.innerWidth - 376))}px`,
  top: `${Math.max(12, Math.min(y + 12, win.innerHeight - 260))}px`
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface ReviewerProps {
  doc: Document;
  store: ReviewerStore;
  modes?: ModeSwitchProps;
  onClose: () => void;
}

export function Reviewer(props: ReviewerProps) {
  const { doc, store } = props;
  const win = doc.defaultView ?? window;
  const origin = (doc.location.origin && doc.location.origin !== 'null') ? doc.location.origin : 'local';

  const [loaded, setLoaded] = useState(false);
  const [identity, setIdentity] = useState<ReviewerIdentity | null>(null);
  const [simpleMode, setSimpleMode] = useState(true);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [annotating, setAnnotating] = useState(false);
  const [candidate, setCandidate] = useState<Element | null>(null);
  const [tapped, setTapped] = useState(false);
  const touchPress = useRef(false);
  /** Where the first tap landed, so a note added from the hint card sits on that spot. */
  const tapAt = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ el: Element; at: { x: number; y: number } } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [panel, setPanel] = useState<'review' | 'settings' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editedReviewText, setEditedReviewText] = useState<string | null>(null);
  const [href, setHref] = useState(doc.location.href);
  const [uiPrefs, setUiPrefs] = useUiPrefs(doc);
  const [, setTick] = useState(0);

  // Identity form state (first-use & settings)
  const [nameInput, setNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<ReviewerRole>('PM');

  useEffect(() => {
    let active = true;
    void Promise.all([
      store.loadIdentity(),
      store.loadSimpleMode(),
      store.loadNotes(origin)
    ]).then(([id, simple, savedNotes]) => {
      if (!active) return;
      setIdentity(id);
      if (id) {
        setNameInput(id.name);
        setRoleInput(id.role);
      }
      setSimpleMode(simple);
      setNotes(savedNotes);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [origin, store]);

  // Follow SPA route changes & reposition markers on scroll/resize
  useEffect(() => {
    const timer = setInterval(() => setHref(h => (h === doc.location.href ? h : doc.location.href)), 300);
    const onMove = () => setTick(t => t + 1);
    win.addEventListener('scroll', onMove, true);
    win.addEventListener('resize', onMove);
    return () => {
      clearInterval(timer);
      win.removeEventListener('scroll', onMove, true);
      win.removeEventListener('resize', onMove);
    };
  }, []);

  // Esc closes popover/panel/annotating
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draft) { setDraft(null); setDraftText(''); }
      else if (openNoteId) { setOpenNoteId(null); setEditingNoteId(null); }
      else if (panel) setPanel(null);
      else if (annotating) { setAnnotating(false); setCandidate(null); setTapped(false); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [draft, openNoteId, panel, annotating]);

  const route = normalizeReviewPath(routeOf(href));
  const here = useMemo(() => notes.filter(n => normalizeReviewPath(n.path) === route), [notes, route]);
  const pages = useMemo(() => {
    const map = new Map<string, { note: ReviewNote; number: number }[]>();
    notes.forEach((n, idx) => {
      const p = normalizeReviewPath(n.path);
      map.set(p, [...(map.get(p) ?? []), { note: n, number: idx + 1 }]);
    });
    return map;
  }, [notes]);

  const generatedReviewText = useMemo(() => {
    if (!identity || !notes.length) return '';
    const review: TeamReview = {
      version: 1,
      reviewer: identity,
      site: origin,
      createdAt: notes[notes.length - 1]?.createdAt ?? new Date().toISOString(),
      viewport: notes[notes.length - 1]?.viewport ?? `${win.innerWidth}x${win.innerHeight}`,
      browser: notes[notes.length - 1]?.browser ?? browserLabel(win.navigator.userAgent),
      notes
    };
    return formatTeamReview(review);
  }, [identity, notes, origin]);

  const reviewBoxText = editedReviewText ?? generatedReviewText;

  const persistNotes = (next: ReviewNote[]) => {
    setNotes(next);
    setEditedReviewText(null);
    setCopied(false);
    void store.saveNotes(origin, next);
  };

  const saveIdentity = (startAnnotating: boolean) => {
    const clean = nameInput.trim();
    if (!clean) return;
    const next: ReviewerIdentity = { name: clean, role: roleInput };
    setIdentity(next);
    setEditedReviewText(null);
    void store.saveIdentity(next);
    if (startAnnotating) setAnnotating(true);
  };

  const startDraft = (el: Element, x: number, y: number) => {
    setOpenNoteId(null);
    setPanel(null);
    setTapped(false);
    if (touchPress.current) setCandidate(null);
    setDraft({ el, at: { x, y } });
    setDraftText('');
  };

  const pickDown = (e: PointerEvent) => { touchPress.current = e.pointerType === 'touch'; };
  const pickMove = (e: PointerEvent) => { if (e.pointerType !== 'touch') { setCandidate(elementAt(doc, e.clientX, e.clientY)); setTapped(false); } };
  const pickLeave = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !tapped) setCandidate(null); };
  const pickClick = (e: MouseEvent) => {
    const el = elementAt(doc, e.clientX, e.clientY);
    if (!el) return;
    if (touchPress.current && !(tapped && el === candidate)) { setCandidate(el); setTapped(true); tapAt.current = { x: e.clientX, y: e.clientY }; return; }
    startDraft(el, e.clientX, e.clientY);
  };
  /** Add note on the tapped element, from the hint card: on the tapped spot when it is still inside. */
  const noteTapped = (el: Element) => {
    const r = el.getBoundingClientRect();
    const at = tapAt.current;
    const inside = at && at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
    startDraft(el, inside ? at.x : r.left + r.width / 2, inside ? at.y : r.bottom);
  };
  const pickWheel = (e: WheelEvent) => {
    e.preventDefault();
    const under = elementAt(doc, e.clientX, e.clientY);
    const box = scrollableAncestor(under, e.deltaX, e.deltaY);
    if (box) box.scrollBy(e.deltaX, e.deltaY);
    else win.scrollBy(e.deltaX, e.deltaY);
  };

  const saveDraft = () => {
    if (!draft || !draftText.trim()) return;
    const captured = captureReviewElement(draft.el, doc, win, draft.at);
    const note: ReviewNote = {
      id: `rn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      path: captured.path,
      note: draftText.trim(),
      anchor: captured.anchor,
      measured: captured.measured,
      url: captured.url,
      viewport: captured.viewport,
      browser: captured.browser,
      createdAt: new Date().toISOString()
    };
    persistNotes([...notes, note]);
    setDraft(null);
    setDraftText('');
  };

  const updateNote = (id: string, text: string) => {
    const clean = text.trim();
    if (!clean) return;
    persistNotes(notes.map(n => (n.id === id ? { ...n, note: clean } : n)));
    setEditingNoteId(null);
    setEditingText('');
  };

  const deleteNote = (id: string) => {
    persistNotes(notes.filter(n => n.id !== id));
    if (openNoteId === id) setOpenNoteId(null);
    if (editingNoteId === id) setEditingNoteId(null);
  };

  const clearReview = () => {
    persistNotes([]);
    setConfirmClear(false);
    setOpenNoteId(null);
    setEditingNoteId(null);
  };

  const copyReview = async () => {
    if (!reviewBoxText.trim()) return;
    const ok = await copyToClipboard(doc, reviewBoxText);
    setCopied(ok);
  };

  const markerPos = (note: ReviewNote): { x: number; y: number } | null => {
    if (note.anchor?.selector) {
      try {
        const el = querySelectorDeep(doc, note.anchor.selector);
        if (el) {
          // On the spot that was clicked; notes saved before that was kept sit at the top-right corner
          const p = note.anchor.point ?? { x: 1, y: 0 };
          const r = el.getBoundingClientRect();
          if (r.width || r.height) return { x: r.left + p.x * r.width, y: r.top + p.y * r.height };
        }
      } catch { /* ignore invalid selector */ }
    }
    if (note.anchor?.position) {
      const docW = Math.max(doc.documentElement.scrollWidth || 0, win.innerWidth || 1);
      const docH = Math.max(doc.documentElement.scrollHeight || 0, win.innerHeight || 1);
      return {
        x: (note.anchor.position[0] / 100) * docW - win.scrollX,
        y: (note.anchor.position[1] / 100) * docH - win.scrollY
      };
    }
    return null;
  };

  const toggleAnnotate = () => {
    if (!identity) return;
    setAnnotating(a => !a);
    setCandidate(null);
    setTapped(false);
    setDraft(null);
    setPanel(null);
  };
  const toggleReview = () => {
    if (!identity) return;
    setPanel(p => (p === 'review' ? null : 'review'));
    setAnnotating(false);
    setConfirmClear(false);
    setCopied(false);
  };
  const toggleSettings = () => {
    setPanel(p => (p === 'settings' ? null : 'settings'));
    setAnnotating(false);
    setConfirmClear(false);
  };

  useShortcuts(doc, [
    { key: 'A', run: toggleAnnotate },
    { key: 'N', run: toggleReview },
    { key: 'M', run: toggleSettings }
  ]);

  const hoverRect = annotating && candidate && !draft ? candidate.getBoundingClientRect() : null;
  const openNote = openNoteId ? notes.find(n => n.id === openNoteId) ?? null : null;
  const openNoteNum = openNote ? notes.findIndex(n => n.id === openNote.id) + 1 : 0;

  return (
    <div class="luci luci-theme" data-theme={uiPrefs.theme} data-dock={uiPrefs.dock} data-simple={simpleMode ? 'true' : 'false'}>
      <div class="shell">
      <div class="bar" role="toolbar" aria-label="Luci reviewer">
        <button type="button" class="menu-btn" data-action="settings" aria-label="Reviewer settings" aria-pressed={panel === 'settings'}
          data-tip="Settings  M" onClick={toggleSettings}>
          <LuciLogo size={48} />
        </button>
        {props.modes && <ModeSwitch {...props.modes} />}
        <span class="bar-sep" aria-hidden="true" />
        <Button iconOnly size="lg" class="tool" icon={IconAnnotate} label="Annotate" shortcut="A"
          disabled={!identity} aria-pressed={annotating} data-action="annotate" onClick={toggleAnnotate} />
        <Button iconOnly size="lg" class="tool" icon={IconNotes} label={`Review (${notes.length})`} badge={notes.length || undefined} shortcut="N"
          disabled={!identity} aria-pressed={panel === 'review'} data-action="review" onClick={toggleReview} />
        <Button iconOnly size="lg" class="tool" icon={IconClose} label="Close Luci" data-action="close" onClick={props.onClose} />
      </div>

      {/* First-use start guide and identity prompt */}
      {loaded && !identity && panel !== 'settings' && (
        <>
          <div class="sub with-luci" role="note" data-part="start-guide" data-guide="feedback">
            <Mascot pose="listen" size={96} />
            <div class="sub-body">
              <p class="hint"><strong>Team Feedback</strong> lets you click elements, leave plain notes, and copy a review for your team or agent.</p>
              <p class="keys">Switch to <strong>Capture</strong> to extract components, typography, colours, and spacing.</p>
            </div>
          </div>
          <div class="panel" role="dialog" aria-label="Who is reviewing" data-part="reviewer-identity">
            <div class="tf-head-row">
              <h2>Who&apos;s reviewing?</h2>
            </div>
            <p class="dim">Shown on your notes so your team knows who left them. Stored only in this browser.</p>
            <label class="field-stack">
              <span class="field-label">Your name</span>
              <input type="text" class="field" data-part="reviewer-name" placeholder="e.g. Maya" value={nameInput} autofocus
                onInput={e => setNameInput((e.currentTarget as HTMLInputElement).value)}
                onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) saveIdentity(true); }} />
            </label>
            <div class="note-choice">
              <span class="field-label">Your role</span>
              <div class="seg" role="group" aria-label="Reviewer role" data-part="reviewer-role">
                {REVIEWER_ROLES.map(r => (
                  <button type="button" data-role={r} aria-pressed={roleInput === r} onClick={() => setRoleInput(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div class="row">
              <button type="button" class="btn-primary" data-action="save-identity" disabled={!nameInput.trim()}
                onClick={() => saveIdentity(true)}>
                Start reviewing
              </button>
            </div>
          </div>
        </>
      )}

      {/* Idle hint when identity is set */}
      {loaded && identity && !annotating && !draft && !openNote && panel === null && (
        <div class="sub with-luci" role="note" data-part="reviewer-intro">
          <Mascot pose="listen" size={96} />
          <div class="sub-body">
            <p class="hint">Click Annotate, then click any part of the page to leave a note as <strong>{identity.name} ({identity.role})</strong>.</p>
            <p class="keys">A: annotate · N: copy review · M: settings</p>
          </div>
        </div>
      )}

      {/* Annotating hint */}
      {annotating && !draft && (
        <div class="sub with-luci" role="note" data-part="reviewer-hint">
          <Mascot pose="note" size={96} />
          <div class="sub-body">
            {tapped && candidate ? (
              <>
                <p class="hint"><strong>{plainElementLabel(candidate)}</strong></p>
                <div class="row">
                  <button type="button" class="btn-primary" data-action="note-tapped"
                    onClick={() => noteTapped(candidate)}>
                    Add note
                  </button>
                  <button type="button" class="btn-secondary" data-action="tap-parent"
                    disabled={!parentOf(candidate) || parentOf(candidate) === doc.documentElement}
                    onClick={() => setCandidate(parentOf(candidate))}>
                    Parent
                  </button>
                </div>
              </>
            ) : (
              <p class="hint">{touchScreen(win)
                ? 'Tap an element to select it, then add your note.'
                : 'Click any element to leave a note. Press Esc to stop.'}</p>
            )}
          </div>
        </div>
      )}

      {/* Review panel: notes by page + editable review text + Copy review (no paste box) */}
      {panel === 'review' && identity && (
        <div class="panel" role="dialog" aria-label="Your review" data-part="review-panel">
          <div class="tf-head-row">
            <h2>Review · {plural(notes.length, 'note')} on {plural(pages.size, 'page')}</h2>
            <span class="tf-badge" data-part="review-identity">{identity.name} · {identity.role}</span>
          </div>

          {!notes.length ? (
            <EmptyState title="No notes yet" body="Click Annotate, then click any part of this page to leave a note." part="review-empty" />
          ) : (
            <>
              <div class="notes-scroll">
                {[...pages.entries()].map(([p, list]) => (
                  <section class="page-group" data-review-page={p}>
                    <h3>
                      <code>{p}</code>
                      {p === route ? <span class="here">this page</span> : null}
                      <span class="count">{plural(list.length, 'note')}</span>
                    </h3>
                    <ul class="tf-note-list">
                      {list.map(({ note: n, number }) => (
                        <li class="tf-note-row" data-review-note={number}>
                          {editingNoteId === n.id ? (
                            <div class="stack" style={{ flex: '1 1 auto' }}>
                              <textarea aria-label={`Edit note ${number}`} value={editingText}
                                onInput={e => setEditingText((e.currentTarget as HTMLTextAreaElement).value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editingText.trim()) { e.preventDefault(); updateNote(n.id, editingText); } }} />
                              <div class="row">
                                <button type="button" class="btn-primary" disabled={!editingText.trim()} onClick={() => updateNote(n.id, editingText)}>Save</button>
                                <button type="button" onClick={() => setEditingNoteId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span class="tf-note-text"><strong>{number}.</strong> {n.note}</span>
                              <span class="tf-note-actions">
                                <Button iconOnly size="sm" icon={IconEdit} label={`Edit note ${number}`}
                                  onClick={() => { setEditingNoteId(n.id); setEditingText(n.note); }} />
                                <Button iconOnly size="sm" icon={IconDelete} label={`Delete note ${number}`}
                                  onClick={() => deleteNote(n.id)} />
                              </span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <label class="field-stack">
                <div class="tf-head-row">
                  <span class="field-label">Review text <span class="dim">(editable)</span></span>
                  {editedReviewText !== null && (
                    <button type="button" class="link-button" data-action="reset-review-text" onClick={() => setEditedReviewText(null)}>Reset text</button>
                  )}
                </div>
                <textarea class="tf-review-box" data-part="review-text" spellcheck={false} value={reviewBoxText}
                  onInput={e => { setEditedReviewText((e.currentTarget as HTMLTextAreaElement).value); setCopied(false); }} />
              </label>

              <div class="row footer">
                <Button variant="primary" icon={copied ? IconSuccess : IconCopy} data-action="copy-review" onClick={() => void copyReview()}>
                  {copied ? 'Copied review' : 'Copy review'}
                </Button>
                {confirmClear ? (
                  <>
                    <button type="button" class="btn-danger" data-action="clear-review-confirm" onClick={clearReview}>
                      Clear all {notes.length} notes?
                    </button>
                    <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" class="btn-danger" data-action="clear-review" onClick={() => setConfirmClear(true)}>
                    Clear review
                  </button>
                )}
              </div>
              <p class="dim" style={{ margin: 0 }}>
                Notes stay saved for this site. On another page, click Luci&apos;s icon to keep adding to this review.
              </p>
            </>
          )}
        </div>
      )}

      {/* Reviewer settings panel */}
      {panel === 'settings' && (
        <div class="panel" role="dialog" aria-label="Reviewer settings" data-part="reviewer-settings">
          <div class="tf-head-row">
            <h2>Reviewer settings</h2>
          </div>

          <div class="stack">
            <span class="field-label">Your identity</span>
            <p class="dim" style={{ margin: 0 }}>Shown on your notes. Stored only in this browser.</p>
            <input type="text" class="field" data-part="settings-reviewer-name" placeholder="Your name" value={nameInput} autofocus
              onInput={e => setNameInput((e.currentTarget as HTMLInputElement).value)} />
            <div class="seg" role="group" aria-label="Reviewer role" data-part="settings-reviewer-role">
              {REVIEWER_ROLES.map(r => (
                <button type="button" data-role={r} aria-pressed={roleInput === r} onClick={() => setRoleInput(r)}>{r}</button>
              ))}
            </div>
            <div class="row">
              <Button variant="secondary" icon={IconCheck} data-action="update-identity" disabled={!nameInput.trim()}
                onClick={() => { saveIdentity(false); setPanel(null); }}>
                Save identity
              </Button>
            </div>
          </div>

          <hr class="settings-divider" />
          <AppearanceControls prefs={uiPrefs} onChange={setUiPrefs} />

          {notes.length > 0 && (
            <>
              <hr class="settings-divider" />
              <div class="row">
                {confirmClear ? (
                  <>
                    <button type="button" class="btn-danger" data-action="settings-clear-confirm" onClick={clearReview}>
                      Clear all {notes.length} notes?
                    </button>
                    <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" class="btn-danger" data-action="settings-clear" onClick={() => setConfirmClear(true)}>
                    Clear review ({notes.length})
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      </div>

      {annotating && !draft && (
        <div class="pick-layer" data-part="pick-layer"
          onPointerDown={pickDown} onPointerMove={pickMove} onClick={pickClick} onWheel={pickWheel}
          onPointerLeave={pickLeave} />
      )}

      {hoverRect && candidate && (
        <>
          <div class="highlight" style={{ left: `${hoverRect.left}px`, top: `${hoverRect.top}px`, width: `${hoverRect.width}px`, height: `${hoverRect.height}px` }} />
          <div class="label" data-part="hover-label" style={{ left: `${hoverRect.left}px`, top: `${Math.max(0, hoverRect.top - 24)}px` }}>
            {plainElementLabel(candidate)}
          </div>
        </>
      )}

      {/* Numbered markers on the current page */}
      {here.map(n => {
        const pos = markerPos(n);
        if (!pos) return null;
        const num = notes.findIndex(item => item.id === n.id) + 1;
        return (
          <button type="button" class="marker" data-reviewer-marker={num} title={`Note ${num}: ${n.note}`}
            style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
            onClick={() => { setOpenNoteId(cur => (cur === n.id ? null : n.id)); setDraft(null); setEditingNoteId(null); }}>
            {num}
          </button>
        );
      })}

      {/* New note popover (B-42: sheet layout below 640px) */}
      {draft && identity && (
        <div class="pop" role="dialog" aria-label="New review note" data-part="reviewer-note-form" style={win.innerWidth < 640 ? {} : popAt(win, draft.at.x, draft.at.y)}>
          <div class="tf-head-row">
            <h3>Note on {plainElementLabel(draft.el)}</h3>
            <span class="tf-badge" data-part="note-author">{identity.name} · {identity.role}</span>
          </div>
          <textarea aria-label="What should change?" data-part="reviewer-comment" placeholder="What should change?" value={draftText} autoFocus
            onInput={e => setDraftText((e.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draftText.trim()) { e.preventDefault(); saveDraft(); } }} />
          <div class="row">
            <button type="button" class="btn-primary" data-action="save-review-note" disabled={!draftText.trim()} onClick={saveDraft}>Save</button>
            <button type="button" data-action="cancel-review-note" onClick={() => { setDraft(null); setDraftText(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Existing marker popover (B-42: sheet layout below 640px) */}
      {openNote && identity && (() => {
        const pos = markerPos(openNote);
        const isEditing = editingNoteId === openNote.id;
        return (
          <div class="pop" role="dialog" aria-label={`Review note ${openNoteNum}`} data-part="reviewer-note-pop" style={win.innerWidth < 640 ? {} : popAt(win, pos?.x ?? 24, pos?.y ?? 24)}>
            <div class="tf-head-row">
              <h3>Note {openNoteNum}</h3>
              <span class="tf-badge">{identity.name} · {identity.role}</span>
            </div>
            {isEditing ? (
              <>
                <textarea aria-label={`Edit note ${openNoteNum}`} data-part="edit-review-comment" value={editingText} autoFocus
                  onInput={e => setEditingText((e.currentTarget as HTMLTextAreaElement).value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editingText.trim()) { e.preventDefault(); updateNote(openNote.id, editingText); } }} />
                <div class="row">
                  <button type="button" class="btn-primary" data-action="save-edit-note" disabled={!editingText.trim()}
                    onClick={() => updateNote(openNote.id, editingText)}>Save</button>
                  <button type="button" onClick={() => setEditingNoteId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p class="comment" style={{ margin: 0 }}>{openNote.note}</p>
                <div class="row">
                  <button type="button" data-action="edit-review-note" onClick={() => { setEditingNoteId(openNote.id); setEditingText(openNote.note); }}>Edit</button>
                  <button type="button" class="btn-danger" data-action="delete-review-note" onClick={() => deleteNote(openNote.id)}>Delete</button>
                  <button type="button" onClick={() => setOpenNoteId(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export interface ExtensionChooserProps {
  doc: Document;
  onChoose: (tab: 'reviewer' | 'capture') => void;
  onClose: () => void;
}

export function ExtensionChooser(props: ExtensionChooserProps) {
  const [uiPrefs] = useUiPrefs(props.doc);
  return (
    <div class="luci luci-theme" data-theme={uiPrefs.theme} data-dock={uiPrefs.dock}>
      <div class="shell">
        <div class="bar" role="toolbar" aria-label="Luci">
          <span class="menu-btn" aria-hidden="true"><LuciLogo size={48} /></span>
          <span class="brand">Luci</span>
          <Button iconOnly size="lg" class="tool" icon={IconClose} label="Close Luci" data-action="close" onClick={props.onClose} />
        </div>
        <div class="panel" role="dialog" aria-label="Choose how to use Luci" data-part="extension-chooser">
          <div class="menu-head">
            <Mascot pose="peek" size={96} />
            <div class="brand-stack">
              <h2>How do you want to use Luci?</h2>
              <p class="dim" style={{ margin: 0 }}>You can switch anytime from the toolbar.</p>
            </div>
          </div>
          <div class="tf-choices">
            <button type="button" class="tf-choice-btn primary" data-choice="reviewer" onClick={() => props.onChoose('reviewer')}>
              <span class="tf-choice-title">Review a site</span>
              <span class="tf-choice-sub">Click elements, leave plain notes, and copy a review for your team.</span>
            </button>
            <button type="button" class="tf-choice-btn" data-choice="capture" onClick={() => props.onChoose('capture')}>
              <span class="tf-choice-title">Capture designs</span>
              <span class="tf-choice-sub">Read components, typography, colours, spacing and states for your coding agent.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
