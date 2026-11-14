import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { mountToolbar, type ForcedReading, type ToolbarHandle } from '@luci/capture';
import { basketItemSchema, type CaptureSettings } from '@luci/format/capture';

const SETTINGS_KEY = 'captureSettings';
const BASKET_KEY = 'basket';
// The extension's isolated world keeps this between injections; the page can't see it
const holder = globalThis as typeof globalThis & { __luciToolbar?: ToolbarHandle };

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
  return (raw['dataUrl'] ?? raw['reading']) as T;
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
    // The bar can be dragged anywhere, off the page's own header buttons and links
    movable: true,
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
    onHelp: () => { void ask<string>({ type: 'luci:open-help' }).catch((err: unknown) => { window.alert(`Luci could not open its help page. ${err instanceof Error ? err.message : String(err)}`); }); },
    // Exact component states: the background attaches the debugger just for this reading
    readForcedStates: (count, options) => ask<ForcedReading>({ type: 'luci:read-states', count, options }),
    // Responsive capture: the background resizes this tab through the debugger, then puts it back
    setViewportWidth: async (width) => { await ask<string>({ type: 'luci:set-viewport', width }); }
  });
});
