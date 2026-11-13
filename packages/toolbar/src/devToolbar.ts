/**
 * The dev toolbar (M6): Luci in your own app while you develop it. Two modes in one bar: Feedback
 * (annotate the app for your agent) and Capture (the extension's tools, with "Save to project").
 * With `luci serve` running in the project, feedback and saved captures go to .luci/, where the
 * agent reads them through luci-mcp; without it, feedback stays in this browser and the bar says
 * how to connect.
 */
import { LUCI_UI_ATTRIBUTE, mountToolbar, type BasketStore } from '@luci/capture';
import { basketItemSchema, type BasketItem, type CaptureSettings } from '@luci/format/capture';
import {
  DEFAULT_FEEDBACK_SETTINGS,
  bridgeBackend,
  bridgeReachable,
  browserBackend,
  mountFeedback,
  type BridgeHealth,
  type FeedbackBackend,
  type FeedbackSettings,
  type KeyValue
} from '@luci/feedback';

export const DEFAULT_BRIDGE = 'http://127.0.0.1:4545';
export const LAUNCHER_TAG = 'luci-launcher';
export type Mode = 'feedback' | 'capture';

export interface DevToolbarOptions {
  /** The `luci serve` address. Default: the one the script was served from, else http://127.0.0.1:4545. */
  bridge?: string;
  doc?: Document;
  /** Where settings, the basket and (without the bridge) feedback are kept. Default: localStorage. */
  storage?: KeyValue;
  /** The mode to open in (default: the last one used in this tab, else Feedback). */
  mode?: Mode;
  pollMs?: number;
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

/** Mount the dev toolbar once per page. */
export async function mountDevToolbar(options: DevToolbarOptions = {}): Promise<DevToolbarHandle> {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const storage = options.storage ?? defaultStorage(win);
  const bridge = (options.bridge ?? (win as unknown as { __LUCI_BRIDGE__?: string }).__LUCI_BRIDGE__ ?? DEFAULT_BRIDGE).replace(/\/+$/, '');

  const noteFor = (h: BridgeHealth) => (h.ok
    ? `luci serve is running, but ${h.project ?? 'its folder'} has no .luci/ yet: run \`luci init\` there. Until then, notes stay in this browser.`
    : `Not connected to your project (${bridge}: ${h.reason ?? 'no answer'}). Run \`luci serve\` in it to save notes where your agent reads them, then click here. Until then, they stay in this browser.`);
  const health = await bridgeReachable(bridge);
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
  let current: { destroy(): void } | null = null;
  let launcher: HTMLElement | null = null;

  const removeLauncher = () => { launcher?.remove(); launcher = null; };
  const showLauncher = () => {
    removeLauncher();
    launcher = doc.createElement(LAUNCHER_TAG);
    launcher.setAttribute(LUCI_UI_ATTRIBUTE, '');
    const root = launcher.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>button{position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 12px;border-radius:999px;border:1px solid #3f3f46;background:#18181b;color:#f4f4f5;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgb(0 0 0 / .3)}</style><button type="button" data-action="open-luci" title="Open Luci">Luci</button>';
    root.querySelector('button')!.addEventListener('click', (e) => { e.stopPropagation(); show(mode); });
    doc.documentElement.appendChild(launcher);
  };

  const show = (next: Mode) => {
    current?.destroy();
    removeLauncher();
    mode = next;
    try { session?.setItem(KEYS.mode, mode); } catch { /* not available */ }
    if (mode === 'feedback') {
      current = mountFeedback({
        doc,
        backend,
        ...(connected ? {} : { connectNote, onConnect: connect }),
        settings: readJson<FeedbackSettings>(storage, KEYS.feedback, DEFAULT_FEEDBACK_SETTINGS),
        onSettingsChange: s => storage.setItem(KEYS.feedback, JSON.stringify(s)),
        onCapture: () => show('capture'),
        onClose: () => { current = null; showLauncher(); },
        ...(options.pollMs ? { pollMs: options.pollMs } : {})
      });
    } else {
      current = mountToolbar({
        doc,
        settings: readJson<CaptureSettings>(storage, KEYS.capture, {}),
        onSettingsChange: s => storage.setItem(KEYS.capture, JSON.stringify(s)),
        basket: storageBasket(storage),
        modeButton: { label: 'Feedback', title: 'Leave notes on the app for your agent', onClick: () => show('feedback') },
        ...(backend.saveCapture ? { saveToProject: backend.saveCapture } : {}),
        onClose: () => { current = null; showLauncher(); }
      });
    }
  };

  show(mode);
  return {
    get backend() { return backend; },
    connect,
    mode: () => mode,
    show,
    destroy: () => { current?.destroy(); current = null; removeLauncher(); }
  };
}
