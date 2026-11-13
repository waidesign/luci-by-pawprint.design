import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { mountToolbar, type ForcedReading, type ToolbarHandle } from '@luci/capture';
import { basketItemSchema, type CaptureSettings } from '@luci/format/capture';

const SETTINGS_KEY = 'captureSettings';
const BASKET_KEY = 'basket';
// The extension's isolated world keeps this between injections; the page can't see it
const holder = globalThis as typeof globalThis & { __luciToolbar?: ToolbarHandle };

/** What to tell the user when this toolbar has lost its extension (reloaded, updated or restarted). */
export const DISCONNECTED = "Luci was updated or restarted, so this toolbar lost its connection. Reload this page, then click Luci's icon again.";
const CONNECTION_LOST = /Receiving end does not exist|Extension context invalidated|message port closed/i;

/** Ask the background for something; a lost connection becomes a plain instruction. */
async function ask<T>(message: Record<string, unknown>): Promise<T> {
  if (!browser.runtime?.id) throw new Error(DISCONNECTED);
  let reply: { ok: true; value: T } | { ok: false; error: string } | undefined;
  try {
    const raw = (await browser.runtime.sendMessage(message)) as Record<string, unknown> | undefined;
    reply = raw && raw['ok'] ? { ok: true, value: (raw['dataUrl'] ?? raw['reading']) as T } : raw ? { ok: false, error: String(raw['error']) } : undefined;
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    throw new Error(CONNECTION_LOST.test(text) ? DISCONNECTED : text);
  }
  if (!reply) throw new Error(DISCONNECTED);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

/** Injected when the user clicks Luci's icon: mount the toolbar, or close it when it is already open. */
export default defineUnlistedScript(async () => {
  if (holder.__luciToolbar?.host.isConnected) {
    holder.__luciToolbar.destroy();
    holder.__luciToolbar = undefined;
    return;
  }
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  holder.__luciToolbar = mountToolbar({
    settings: (stored[SETTINGS_KEY] as CaptureSettings | undefined) ?? {},
    onSettingsChange: (settings) => { void browser.storage.local.set({ [SETTINGS_KEY]: settings }); },
    onClose: () => { holder.__luciToolbar = undefined; },
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
    onHelp: () => { void ask<string>({ type: 'luci:open-help' }).catch(() => undefined); },
    // Exact component states: the background attaches the debugger just for this reading
    readForcedStates: (count) => ask<ForcedReading>({ type: 'luci:read-states', count })
  });
});
