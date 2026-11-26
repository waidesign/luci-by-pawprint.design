import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { mountToolbar, type ForcedReading, type Mode, type SavedDesign, type ToolbarHandle } from '@luci-dev/capture';
import {
  mountReviewer,
  type ReviewerHandle,
  type ReviewerStore
} from '@luci-dev/feedback/reviewer';
import { basketItemSchema, type CaptureSettings } from '@luci-dev/format/capture';
import { reviewerIdentitySchema, reviewNoteSchema, type ReviewNote } from '@luci-dev/format/feedback';

const SETTINGS_KEY = 'captureSettings';
const BASKET_KEY = 'basket';
const MY_TOKENS_KEY = 'myTokens';
const BRIDGE_URL_KEY = 'bridgeUrl';
const TAB_KEY = 'extensionTab';
const REVIEWER_IDENTITY_KEY = 'reviewerIdentity';
const REVIEWER_SIMPLE_KEY = 'reviewerSimpleMode';
const REVIEWER_NOTES_KEY = 'reviewerNotesByOrigin';

type ExtensionTab = 'reviewer' | 'capture';
type AnyHandle = { host: HTMLElement; destroy(): void };

const EXTENSION_MODES: readonly Mode[] = [
  { id: 'capture', label: 'Capture', title: 'Capture components, text, colours, spacing and states' },
  { id: 'reviewer', label: 'Team Feedback', title: 'Leave notes on this site and copy a review for your team' }
];

// The extension's isolated world keeps this between injections; the page can't see it
const holder = globalThis as typeof globalThis & { __luciToolbar?: AnyHandle };

/** What to tell the user when this toolbar's extension is gone (reloaded or updated since it opened). */
export const DISCONNECTED = "Luci was updated or reloaded since this toolbar opened. Reload this page, then click Luci's icon again.";

/**
 * Ask the background for something. Chrome's own error text is kept, so a problem can be diagnosed;
 * only a toolbar whose extension is gone gets the plain instruction.
 */
async function ask<T>(message: Record<string, unknown>): Promise<T> {
  if (!browser.runtime?.id) throw new Error(DISCONNECTED);
  let raw: Record<string, unknown> | undefined;
  try {
    raw = (await browser.runtime.sendMessage(message)) as Record<string, unknown> | undefined;
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    console.warn(`Luci: the background did not answer "${String(message['type'])}": ${text}`);
    throw new Error(/Extension context invalidated/i.test(text) ? DISCONNECTED : `Chrome said: "${text}"`);
  }
  if (!raw) throw new Error(`Chrome said: no answer from Luci's background for "${String(message['type'])}".`);
  if (!raw['ok']) throw new Error(String(raw['error']));
  return ('result' in raw ? raw['result'] : raw['dataUrl'] ?? raw['reading'] ?? raw) as T;
}

function extensionReviewerStore(): ReviewerStore {
  return {
    async loadIdentity() {
      const raw = (await browser.storage.local.get(REVIEWER_IDENTITY_KEY))[REVIEWER_IDENTITY_KEY];
      const parsed = reviewerIdentitySchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    async saveIdentity(identity) {
      await browser.storage.local.set({ [REVIEWER_IDENTITY_KEY]: identity });
    },
    async loadSimpleMode() {
      const raw = (await browser.storage.local.get(REVIEWER_SIMPLE_KEY))[REVIEWER_SIMPLE_KEY];
      return typeof raw === 'boolean' ? raw : true;
    },
    async saveSimpleMode(simple) {
      await browser.storage.local.set({ [REVIEWER_SIMPLE_KEY]: simple });
    },
    async loadNotes(origin) {
      const raw = (await browser.storage.local.get(REVIEWER_NOTES_KEY))[REVIEWER_NOTES_KEY];
      const byOrigin = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const list = Array.isArray(byOrigin[origin]) ? byOrigin[origin] as unknown[] : [];
      return list.flatMap(item => {
        const parsed = reviewNoteSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    },
    async saveNotes(origin, notes: ReviewNote[]) {
      const raw = (await browser.storage.local.get(REVIEWER_NOTES_KEY))[REVIEWER_NOTES_KEY];
      const byOrigin: Record<string, ReviewNote[]> = raw && typeof raw === 'object' ? { ...(raw as Record<string, ReviewNote[]>) } : {};
      if (notes.length) byOrigin[origin] = notes;
      else delete byOrigin[origin];
      await browser.storage.local.set({ [REVIEWER_NOTES_KEY]: byOrigin });
    }
  };
}

async function mountTab(tab: ExtensionTab): Promise<void> {
  await browser.storage.local.set({ [TAB_KEY]: tab });

  const switchTab = (nextId: string) => {
    const next: ExtensionTab = nextId === 'reviewer' ? 'reviewer' : 'capture';
    holder.__luciToolbar?.destroy();
    holder.__luciToolbar = undefined;
    void mountTab(next);
  };

  if (tab === 'reviewer') {
    const handle: ReviewerHandle = mountReviewer({
      store: extensionReviewerStore(),
      modes: { current: 'reviewer', modes: EXTENSION_MODES, onSelect: switchTab },
      onClose: () => { holder.__luciToolbar = undefined; }
    });
    holder.__luciToolbar = handle;
    return;
  }

  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const handle: ToolbarHandle = mountToolbar({
    settings: (stored[SETTINGS_KEY] as CaptureSettings | undefined) ?? {},
    onSettingsChange: (settings) => { void browser.storage.local.set({ [SETTINGS_KEY]: settings }); },
    onClose: () => { holder.__luciToolbar = undefined; },
    modes: { current: 'capture', modes: EXTENSION_MODES, onSelect: switchTab },
    // The bar can be dragged anywhere, off the page's own header buttons and links
    movable: true,
    // "Send to project" direct extension bridge (v0.4.4): saves to .luci/design/ via localhost:4545
    saveToProject: async (fileName, markdown) => {
      return ask<{ path: string; replaced: boolean }>({
        type: 'luci:save-to-project',
        fileName,
        markdown
      });
    },
    // Active project information & port switcher (v0.4.4)
    projectInfo: {
      get: async () => {
        try {
          const res = await ask<{ project?: string; initialized: boolean; url: string }>({ type: 'luci:check-bridge' });
          if (!res?.project) return null;
          const name = res.project.split(/[\\/]/).filter(Boolean).pop();
          return { project: res.project, name, url: res.url, initialized: res.initialized };
        } catch {
          return null;
        }
      },
      setUrl: async (url: string) => {
        await ask({ type: 'luci:set-bridge-url', url });
      }
    },
    // Debugger status for settings: a required permission; "request" opens the help page's section on it
    debuggerPermission: {
      get: async () => {
        try {
          const res = await ask<{ granted?: boolean }>({ type: 'luci:check-debugger' });
          return Boolean(res?.granted);
        } catch {
          return false;
        }
      },
      request: () => {
        void ask<string>({ type: 'luci:open-help', section: 'debugger-permission' }).catch(() => undefined);
      }
    },
    // Design check: load saved captures from project if luci serve is running
    designs: {
      list: async () => {
        try {
          return await ask<SavedDesign[]>({ type: 'luci:list-captures' });
        } catch {
          return [];
        }
      },
      read: async (file: string) => {
        return ask<string>({ type: 'luci:read-capture', file });
      }
    },
    // "Make it a rule": saves capture and proposes rule in .luci/memory/proposed/
    makeRule: async (fileName: string, markdown: string) => {
      await ask<{ path: string; replaced: boolean }>({ type: 'luci:save-to-project', fileName, markdown });
      return ask<{ path: string; existed: boolean; rule: string }>({ type: 'luci:propose-rule', file: fileName });
    },
    // "Use my tokens" (v0.4): the tokens the person pasted, or from the project when luci serve runs
    myTokens: {
      project: async () => {
        try {
          return await ask<{ token: string; value: string }[]>({ type: 'luci:project-tokens' });
        } catch {
          return [];
        }
      },
      load: async () => String((await browser.storage.local.get(MY_TOKENS_KEY))[MY_TOKENS_KEY] ?? ''),
      save: async (css) => { await browser.storage.local.set({ [MY_TOKENS_KEY]: css }); }
    },
    // Pixel mode reads colors from a screenshot of this tab, taken by the background
    captureScreen: () => ask<string>({ type: 'luci:capture-screen' }),
    // The basket lives in extension storage: every tab and site sees the same items, across restarts
    basket: {
      load: async () => {
        const raw = (await browser.storage.local.get(BASKET_KEY))[BASKET_KEY];
        return (Array.isArray(raw) ? raw : []).flatMap(item => {
          const parsed = basketItemSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
      },
      save: async (items) => { await browser.storage.local.set({ [BASKET_KEY]: items }); }
    },
    // The "?" button opens the help page in a new tab
    onHelp: (section) => { void ask<string>({ type: 'luci:open-help', ...(section ? { section } : {}) }).catch((err: unknown) => { window.alert(`Luci could not open its help page. ${err instanceof Error ? err.message : String(err)}`); }); },
    // Exact component states: the background attaches the debugger just for this reading
    readForcedStates: (count, options) => ask<ForcedReading>({ type: 'luci:read-states', count, options }),
    // Responsive capture: the background resizes this tab through the debugger, then puts it back
    setViewportWidth: async (width) => { await ask<string>({ type: 'luci:set-viewport', width }); }
  });
  holder.__luciToolbar = handle;
}

/** Injected when the user clicks Luci's icon: mount the toolbar, or close it when it is already open. */
export default defineUnlistedScript(async () => {
  if (holder.__luciToolbar?.host.isConnected) {
    holder.__luciToolbar.destroy();
    holder.__luciToolbar = undefined;
    return;
  }

  const stored = await browser.storage.local.get([TAB_KEY, REVIEWER_IDENTITY_KEY]);
  const savedTab = stored[TAB_KEY];
  const hasIdentity = Boolean(stored[REVIEWER_IDENTITY_KEY]);
  const tab: ExtensionTab = savedTab === 'reviewer' || (!savedTab && hasIdentity) ? 'reviewer' : 'capture';
  await mountTab(tab);
});
