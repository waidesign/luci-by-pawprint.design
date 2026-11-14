/**
 * The dev toolbar (M6): Luci in your own app while you develop it. Two modes in one bar: Feedback
 * (annotate the app for your agent) and Capture (the extension's tools, with "Save to project").
 * With `luci serve` running in the project, feedback and saved captures go to .luci/, where the
 * agent reads them through luci-mcp; without it, feedback stays in this browser and the bar says
 * how to connect.
 */
import {
  LUCI_UI_ATTRIBUTE, TOOLBAR_REPLACE_EVENT, UI_PREFS_EVENT, mountToolbar, readUiPrefs, writeUiPrefs,
  type BarPlace, type BasketStore, type CheckNote
} from '@luci/capture';
import { basketItemSchema, type BasketItem, type CaptureSettings } from '@luci/format/capture';
import { ANIMATIONS_CSS, COPY, TOKENS_CSS, mascotSvg } from '@luci/ui';
import {
  DEFAULT_FEEDBACK_SETTINGS,
  bridgeBackend,
  bridgeReachable,
  browserBackend,
  describeTarget,
  mountFeedback,
  mountLayout,
  type BridgeHealth,
  type FeedbackBackend,
  type FeedbackSettings,
  type KeyValue
} from '@luci/feedback';

export const DEFAULT_BRIDGE = 'http://127.0.0.1:4545';
export const LAUNCHER_TAG = 'luci-launcher';
export type Mode = 'feedback' | 'layout' | 'capture';
/** The modes, as the switch shows them. */
export const MODES = [
  { id: 'feedback', label: 'Feedback', title: 'Feedback: leave notes on your app for your coding agent' },
  { id: 'layout', label: 'Layout', title: 'Layout: resize, move and space elements on the live page, then send the plan to your agent' },
  { id: 'capture', label: 'Capture', title: 'Capture: take a component, text, color or spacing as a design file' }
] as const;

export interface DevToolbarOptions {
  /** The `luci serve` address. Default: the one the script was served from, else http://127.0.0.1:4545. */
  bridge?: string;
  doc?: Document;
  /** Where settings, the basket and (without the bridge) feedback are kept. Default: localStorage. */
  storage?: KeyValue;
  /** The mode to open in (default: the last one used in this tab, else Feedback). */
  mode?: Mode;
}

export interface DevToolbarHandle {
  readonly backend: FeedbackBackend;
  /** Check for `luci serve` again; null when connected, else why not. */
  connect(): Promise<string | null>;
  mode(): Mode;
  show(mode: Mode): void;
  destroy(): void;
}

const KEYS = { capture: 'luci.capture.settings', feedback: 'luci.feedback.settings', basket: 'luci.basket', items: 'luci.feedback', mode: 'luci.mode' } as const;

/** localStorage, or memory when the page cannot use it (a sandboxed frame, privacy settings). */
function defaultStorage(win: Window): KeyValue {
  try {
    const s = win.localStorage;
    s.getItem(KEYS.mode);
    return s;
  } catch {
    const m = new Map<string, string>();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  }
}

const readJson = <T>(storage: KeyValue, key: string, fallback: T): T => {
  try { return { ...fallback, ...(JSON.parse(storage.getItem(key) ?? 'null') ?? {}) }; } catch { return fallback; }
};

/** The basket in the app's storage, so it survives reloads and pages of the app. */
export function storageBasket(storage: KeyValue, key: string = KEYS.basket): BasketStore {
  return {
    load: async () => {
      try {
        const raw = JSON.parse(storage.getItem(key) ?? '[]') as unknown[];
        return raw.flatMap(r => { const p = basketItemSchema.safeParse(r); return p.success ? [p.data as BasketItem] : []; });
      } catch {
        return [];
      }
    },
    save: async (items) => storage.setItem(key, JSON.stringify(items))
  };
}

/**
 * A design check's differences as feedback notes on the built component (intent fix): one note per
 * difference, each with what the design says and what was built, so the page-grouped prompt and
 * watch_feedback carry them like any note. Returns their IDs.
 */
export async function addCheckNotes(backend: FeedbackBackend, doc: Document, el: Element, notes: readonly CheckNote[]): Promise<string[]> {
  const { target, pageSource } = await describeTarget(el, backend.resolveFrames ? { serverResolve: backend.resolveFrames } : {});
  const page = { url: doc.location.href, title: doc.title, ...(pageSource ? { source: pageSource } : {}) };
  const refs: string[] = [];
  // One after another: each note's ID is the next on this page
  for (const n of notes) refs.push((await backend.add({ page, target, comment: n.comment, intent: 'fix', priority: n.priority, check: n.check })).ref);
  return refs;
}

export const CONNECTING_TAG = 'luci-connecting';

/** Keep at least this much of the window between a dragged bar and its edges. */
const EDGE = 8;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
/** CSS that puts something in a place's corner (the launcher, the connecting pill), never off screen. */
const cornerCss = (p: BarPlace, size: number) =>
  `${p.h}:min(${p.x}px, calc(100vw - ${size + EDGE}px));${p.v}:min(${p.y}px, calc(100vh - ${size + EDGE}px))`;

/** "Connecting to your project…" with a spinner, where the bar will appear. */
function connectingPill(doc: Document, place: BarPlace): HTMLElement {
  const host = doc.createElement(CONNECTING_TAG);
  host.setAttribute(LUCI_UI_ATTRIBUTE, '');
  const root = host.attachShadow({ mode: 'open' });
  // The Charcoal pill (brand/DESIGN.md, On-page toolbar), with a ginger ring turning
  root.innerHTML = `<style>${TOKENS_CSS}
    div{position:fixed;${cornerCss(place, 40)};z-index:2147483647;display:flex;gap:8px;align-items:center;padding:8px 16px 8px 12px;border-radius:var(--luci-radius-full);
      background:var(--luci-color-bar);color:var(--luci-color-bar-ink);font:500 var(--luci-type-small-size)/var(--luci-type-small-line) var(--luci-font-body);box-shadow:var(--luci-shadow-float)}
    i{width:14px;height:14px;border-radius:50%;border:2px solid var(--luci-color-bar-stroke);border-top-color:var(--luci-color-tool-active);animation:s .8s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion: reduce){i{animation:none}}
  </style><div role="status" aria-live="polite" data-part="connecting"><i aria-hidden="true"></i><span>${COPY.devToolbar.connecting}</span></div>`;
  doc.documentElement.appendChild(host);
  return host;
}

/** Mount the dev toolbar once per page. */
export async function mountDevToolbar(options: DevToolbarOptions = {}): Promise<DevToolbarHandle> {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const storage = options.storage ?? defaultStorage(win);
  const bridge = (options.bridge ?? (win as unknown as { __LUCI_BRIDGE__?: string }).__LUCI_BRIDGE__ ?? DEFAULT_BRIDGE).replace(/\/+$/, '');

  const noteFor = (h: BridgeHealth) => (h.ok
    ? `luci serve is running, but ${h.project ?? 'its folder'} has no .luci/ yet: run \`luci init\` there. Until then, notes stay in this browser.`
    : `Not connected to your project (${bridge}: ${h.reason ?? 'no answer'}). Run \`luci serve\` in it to save notes where your agent reads them, then click here. Until then, they stay in this browser.`);
  /*
   * Where the bar is: its dock's bottom corner by default (next to Luci's button), or where the person
   * dragged it (kept in the UI preferences as devPlace: the nearest corner and the distances from its
   * edges). Each mode's host gets data-h, data-v, --luci-x and --luci-y; the shared styles place the bar
   * and open its cards from there, on the side with room.
   */
  const homePlace = (): BarPlace => ({ h: readUiPrefs(doc).dock === 'left' ? 'left' : 'right', v: 'bottom', x: 12, y: 12 });
  let place: BarPlace = readUiPrefs(doc).devPlace ?? homePlace();

  // The bar's place says what Luci is doing while it looks for `luci serve` (up to a few seconds)
  const connecting = connectingPill(doc, place);
  let health: BridgeHealth;
  try {
    health = await bridgeReachable(bridge);
  } finally {
    connecting.remove();
  }
  let connected = health.ok && health.initialized;
  let backend: FeedbackBackend = connected ? bridgeBackend(bridge) : browserBackend(storage, KEYS.items);
  let connectNote = noteFor(health);
  if (!connected) console.info(`Luci: ${connectNote}`);

  /** Check again (the person started luci serve): switch to the project when it answers. */
  const connect = async (): Promise<string | null> => {
    const h = await bridgeReachable(bridge, { attempts: 1 });
    connectNote = noteFor(h);
    if (!(h.ok && h.initialized)) return connectNote;
    connected = true;
    backend = bridgeBackend(bridge);
    show(mode);
    return null;
  };

  let session: KeyValue | null = null;
  try { session = win.sessionStorage; } catch { /* not available */ }
  let mode: Mode = options.mode ?? ((session?.getItem(KEYS.mode) as Mode | null) ?? 'feedback');
  let current: { host: HTMLElement; destroy(): void } | null = null;
  let launcher: HTMLElement | null = null;

  const removeLauncher = () => { launcher?.remove(); launcher = null; };
  const showLauncher = () => {
    removeLauncher();
    launcher = doc.createElement(LAUNCHER_TAG);
    launcher.setAttribute(LUCI_UI_ATTRIBUTE, '');
    const root = launcher.attachShadow({ mode: 'open' });
    // Luci's head in a Ginger circle: the 48 px menu button (brand/DESIGN.md, On-page toolbar), in the
    // corner of the bar's place, where the bar grows from
    root.innerHTML = `<style>${TOKENS_CSS}${ANIMATIONS_CSS}
      button{position:fixed;${cornerCss(place, 48)};z-index:2147483647;display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;border:0;
        border-radius:var(--luci-radius-full);background:var(--luci-color-primary);cursor:pointer;box-shadow:var(--luci-shadow-float);transition:background-color var(--luci-motion-fast)}
      button:hover{background:var(--luci-color-primary-hover)}
      button:focus-visible{outline:2px solid var(--luci-color-focus);outline-offset:2px}
      button span{display:block;width:38px;line-height:0} svg{display:block;width:100%;height:auto}
      @media (prefers-reduced-motion: reduce){button{transition:none}}
    </style><button type="button" data-action="open-luci" aria-label="${COPY.devToolbar.open}" title="${COPY.devToolbar.open}"><span>${mascotSvg('head')}</span></button>`;
    const button = root.querySelector('button')!;
    button.style.cursor = 'grab';
    button.style.touchAction = 'none';
    /*
     * The button moves on its own, without opening the bar (user request, 2026-11-15): 4 px before a
     * press counts as a drag, so a click still opens it. Dropped, it takes the nearest corner, which is
     * also where the bar will grow from (they share one place).
     */
    let press: { id: number; x0: number; y0: number; rect: DOMRect; moved: boolean } | null = null;
    let moved = false;
    const move = (e: PointerEvent) => {
      const p = press;
      if (!p || e.pointerId !== p.id) return;
      if (!p.moved && !(e.buttons & 1)) { release(); return; }
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      if (!p.moved && Math.hypot(dx, dy) < 4) return;
      if (!p.moved) { p.moved = true; button.setPointerCapture?.(e.pointerId); button.style.cursor = 'grabbing'; }
      const left = clamp(p.rect.left + dx, EDGE, win.innerWidth - EDGE - p.rect.width);
      const top = clamp(p.rect.top + dy, EDGE, win.innerHeight - EDGE - p.rect.height);
      Object.assign(button.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    };
    const up = (e: PointerEvent) => {
      const p = press;
      if (!p || e.pointerId !== p.id) return;
      release();
      if (!p.moved) return;
      moved = true;
      win.setTimeout(() => { moved = false; }, 0);
      const r = button.getBoundingClientRect();
      const vw = win.innerWidth, vh = win.innerHeight;
      const h = r.left + r.width / 2 < vw / 2 ? 'left' : 'right';
      const v = r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom';
      place = { h, v, x: Math.round(h === 'left' ? r.left : vw - r.right), y: Math.round(v === 'top' ? r.top : vh - r.bottom) };
      // Anchored to that corner from now on (so it keeps its place when the window resizes)
      Object.assign(button.style, { left: '', top: '', right: '', bottom: '', cursor: 'grab', [h]: `${place.x}px`, [v]: `${place.y}px`,
        [h === 'left' ? 'right' : 'left']: 'auto', [v === 'top' ? 'bottom' : 'top']: 'auto' });
      writeUiPrefs(doc, { ...readUiPrefs(doc), devPlace: place, dock: h });
    };
    const release = () => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', up, true);
      press = null;
    };
    button.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, rect: button.getBoundingClientRect(), moved: false };
      doc.addEventListener('pointermove', move, true);
      doc.addEventListener('pointerup', up, true);
      doc.addEventListener('pointercancel', up, true);
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      // The click that ends a drag only drops the button
      if (moved) { moved = false; return; }
      show(mode, { grow: true });
    });
    doc.documentElement.appendChild(launcher);
  };

  const reducedMotion = () => { try { return win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  /** The bar grows out of the launcher's corner (opacity and transform only, brand/DESIGN.md motion). */
  const grow = (host: HTMLElement) => {
    const bar = host.shadowRoot?.querySelector<HTMLElement>('.bar');
    if (!bar || reducedMotion() || typeof bar.animate !== 'function') return;
    const origin = `${place.h} ${place.v}`;
    bar.animate([
      { opacity: 0, transform: `translateY(${place.v === 'top' ? -8 : 8}px) scale(0.3)`, transformOrigin: origin },
      { opacity: 1, transform: 'none', transformOrigin: origin }
    ], { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  };

  /** Put a mode's host in the bar's place, kept inside the window. */
  const applyPlace = (host: HTMLElement) => {
    const bar = host.shadowRoot?.querySelector<HTMLElement>('.bar');
    const x = clamp(place.x, EDGE, win.innerWidth - EDGE - (bar?.offsetWidth ?? 0));
    const y = clamp(place.y, EDGE, win.innerHeight - EDGE - (bar?.offsetHeight ?? 0));
    host.setAttribute('data-h', place.h);
    host.setAttribute('data-v', place.v);
    host.style.setProperty('--luci-x', `${x}px`);
    host.style.setProperty('--luci-y', `${y}px`);
  };

  /*
   * Dragging: by the bar's own background, a separator or Luci's head (4 px before it counts, so a
   * click on Luci still opens the menu). While it moves it keeps its corner; dropped, it takes the
   * nearest one, so its cards open on the side with room.
   */
  let drag: { id: number; x0: number; y0: number; rect: DOMRect; bar: HTMLElement; host: HTMLElement; moved: boolean } | null = null;
  let justMoved = false;
  const stopDrag = () => {
    doc.removeEventListener('pointermove', dragMove, true);
    doc.removeEventListener('pointerup', dragEnd, true);
    doc.removeEventListener('pointercancel', dragEnd, true);
    drag?.host.removeAttribute('data-moving');
    drag = null;
  };
  const dragMove = (e: PointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && !(e.buttons & 1)) { stopDrag(); return; }
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      d.bar.setPointerCapture?.(e.pointerId);
      d.host.setAttribute('data-moving', '');
    }
    const left = clamp(d.rect.left + dx, EDGE, win.innerWidth - EDGE - d.rect.width);
    const top = clamp(d.rect.top + dy, EDGE, win.innerHeight - EDGE - d.rect.height);
    place = {
      ...place,
      x: place.h === 'left' ? left : win.innerWidth - left - d.rect.width,
      y: place.v === 'top' ? top : win.innerHeight - top - d.rect.height
    };
    applyPlace(d.host);
  };
  const dragEnd = (e: PointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.id) return;
    stopDrag();
    if (!d.moved) return;
    // The click that ends a drag is not a click on Luci's head
    justMoved = true;
    win.setTimeout(() => { justMoved = false; }, 0);
    const r = d.bar.getBoundingClientRect();
    const vw = win.innerWidth, vh = win.innerHeight;
    const h = r.left + r.width / 2 < vw / 2 ? 'left' : 'right';
    const v = r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom';
    place = { h, v, x: Math.round(h === 'left' ? r.left : vw - r.right), y: Math.round(v === 'top' ? r.top : vh - r.bottom) };
    applyPlace(d.host);
    writeUiPrefs(doc, { ...readUiPrefs(doc), devPlace: place, dock: h });
  };
  const draggable = (host: HTMLElement) => {
    const root = host.shadowRoot;
    if (!root) return;
    root.addEventListener('pointerdown', (ev) => {
      const e = ev as PointerEvent;
      const t = e.composedPath()[0] as Element | undefined;
      const bar = t?.closest?.('.bar') as HTMLElement | null;
      if (e.button !== 0 || !t || !bar || (t !== bar && !t.closest('.menu-btn, .bar-sep, .brand'))) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, rect: bar.getBoundingClientRect(), bar, host, moved: false };
      doc.addEventListener('pointermove', dragMove, true);
      doc.addEventListener('pointerup', dragEnd, true);
      doc.addEventListener('pointercancel', dragEnd, true);
    });
    root.addEventListener('click', (e) => {
      if (!justMoved) return;
      justMoved = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  };

  // Dock Right or Left (in any menu) puts a dragged bar back in that corner; resizing keeps it inside
  const followPrefs = () => {
    const next = readUiPrefs(doc).devPlace ?? homePlace();
    if (JSON.stringify(next) === JSON.stringify(place)) return;
    place = next;
    if (current) applyPlace(current.host);
    else if (launcher) showLauncher();
  };
  const onResize = () => { if (current) applyPlace(current.host); };
  doc.addEventListener(UI_PREFS_EVENT, followPrefs);
  win.addEventListener('resize', onResize);

  /** The same switch on every mode's bar. */
  const modeSwitch = () => ({ current: mode, modes: MODES, onSelect: (id: string) => show(id as Mode) });

  /*
   * One Luci on the page at a time. Another Capture toolbar opening (the extension's) sends the
   * replace signal: the dev toolbar then closes to its launcher, the way its own close does, so Luci's
   * button stays in the corner. Opening the dev toolbar sends the signal itself, which closes the
   * extension's toolbar; while it does (and while its own Capture mounts), it ignores the signal.
   */
  let opening = false;
  const stepAside = () => {
    if (opening || !current) return;
    current.destroy();
    current = null;
    showLauncher();
  };
  doc.addEventListener(TOOLBAR_REPLACE_EVENT, stepAside);

  const show = (next: Mode, how: { grow?: boolean } = {}) => {
    opening = true;
    try {
      openMode(next, how);
    } finally {
      opening = false;
    }
  };
  const openMode = (next: Mode, how: { grow?: boolean }) => {
    current?.destroy();
    removeLauncher();
    doc.dispatchEvent(new CustomEvent(TOOLBAR_REPLACE_EVENT));
    mode = next;
    try { session?.setItem(KEYS.mode, mode); } catch { /* not available */ }
    if (mode === 'feedback') {
      current = mountFeedback({
        doc,
        backend,
        ...(connected ? {} : { connectNote, onConnect: connect }),
        settings: readJson<FeedbackSettings>(storage, KEYS.feedback, DEFAULT_FEEDBACK_SETTINGS),
        onSettingsChange: s => storage.setItem(KEYS.feedback, JSON.stringify(s)),
        modes: modeSwitch(),
        onClose: () => { current = null; showLauncher(); }
      });
    } else if (mode === 'layout') {
      current = mountLayout({
        doc,
        backend,
        modes: modeSwitch(),
        ...(connected ? {} : { connectNote }),
        onClose: () => { current = null; showLauncher(); }
      });
    } else {
      current = mountToolbar({
        doc,
        settings: readJson<CaptureSettings>(storage, KEYS.capture, {}),
        onSettingsChange: s => storage.setItem(KEYS.capture, JSON.stringify(s)),
        basket: storageBasket(storage),
        modes: modeSwitch(),
        ...(backend.saveCapture ? { saveToProject: backend.saveCapture } : {}),
        // Design check (v0.3): the project's design files, and each difference as a feedback note
        ...(backend.listCaptures && backend.readCapture ? { designs: { list: backend.listCaptures, read: backend.readCapture } } : {}),
        addCheckNotes: (el, notes) => addCheckNotes(backend, doc, el, notes),
        checkNotesWhere: connected ? 'your project' : 'this browser',
        // Capture to rule (v0.3.2): save the capture, then propose a rule that points at it
        ...(backend.saveCapture && backend.proposeRule ? {
          makeRule: async (fileName: string, markdown: string) => {
            await backend.saveCapture!(fileName, markdown);
            return backend.proposeRule!(fileName);
          }
        } : {}),
        onClose: () => { current = null; showLauncher(); }
      });
    }
    // In the bar's place (by its button unless the person dragged it), and draggable
    applyPlace(current.host);
    draggable(current.host);
    if (how.grow) grow(current.host);
  };

  show(mode);
  return {
    get backend() { return backend; },
    connect,
    mode: () => mode,
    show,
    destroy: () => {
      doc.removeEventListener(TOOLBAR_REPLACE_EVENT, stepAside);
      doc.removeEventListener(UI_PREFS_EVENT, followPrefs);
      win.removeEventListener('resize', onResize);
      stopDrag();
      current?.destroy();
      current = null;
      removeLauncher();
    }
  };
}
