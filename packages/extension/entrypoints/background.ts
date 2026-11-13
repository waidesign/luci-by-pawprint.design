import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { readStatesViaCdp, type CdpReadOptions, type ForcedReading } from '@luci/capture/states';

export const READ_STATES = 'luci:read-states';
export const CAPTURE_SCREEN = 'luci:capture-screen';
export const OPEN_HELP = 'luci:open-help';
type ReadStatesReply = { ok: true; reading: ForcedReading } | { ok: false; error: string };
type CaptureReply = { ok: true; dataUrl: string } | { ok: false; error: string };

/**
 * Clicking Luci's icon puts the toolbar on the current tab (or takes it off again).
 * For a component capture the toolbar asks for exact states: the debugger is attached to that tab
 * only for the reading and detached straight after, so Chrome's "debugging this browser" bar shows briefly.
 */
export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/toolbar.js'] });
    } catch (err) {
      // Browser pages (chrome://, the Web Store) can't be scripted by any extension
      console.warn(`Luci can't run on this page: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: ReadStatesReply | CaptureReply) => void) => {
    const m = message as { type?: string; count?: number; options?: CdpReadOptions };
    const tabId = sender.tab?.id;
    if (m?.type === OPEN_HELP) {
      void browser.tabs.create({ url: browser.runtime.getURL('/help.html') });
      sendResponse({ ok: true, dataUrl: '' });
      return false;
    }
    // Pixel mode: a screenshot of the visible tab (allowed by activeTab, granted by the icon click)
    if (m?.type === CAPTURE_SCREEN && sender.tab?.windowId !== undefined) {
      browser.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
        .then(dataUrl => sendResponse({ ok: true, dataUrl }))
        .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    if (m?.type !== READ_STATES || tabId === undefined || typeof m.count !== 'number') return false;
    void (async () => {
      const target = { tabId };
      try {
        await browser.debugger.attach(target, '1.3');
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
      }
      try {
        const send = (method: string, params?: Record<string, unknown>) => browser.debugger.sendCommand(target, method, params);
        sendResponse({ ok: true, reading: await readStatesViaCdp(send, m.count!, m.options ?? {}) });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        await browser.debugger.detach(target).catch(() => undefined);
      }
    })();
    return true; // the reply comes asynchronously
  });
});
