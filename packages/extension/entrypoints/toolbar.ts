import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { mountToolbar, type ForcedReading, type ToolbarHandle } from '@luci/capture';
import type { CaptureSettings } from '@luci/format/capture';

const SETTINGS_KEY = 'captureSettings';
// The extension's isolated world keeps this between injections; the page can't see it
const holder = globalThis as typeof globalThis & { __luciToolbar?: ToolbarHandle };

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
    // Exact component states: the background attaches the debugger just for this reading
    readForcedStates: async (count) => {
      const reply = (await browser.runtime.sendMessage({ type: 'luci:read-states', count })) as { ok: true; reading: ForcedReading } | { ok: false; error: string } | undefined;
      if (!reply) throw new Error('no reply from the extension');
      if (!reply.ok) throw new Error(reply.error);
      return reply.reading;
    }
  });
});
