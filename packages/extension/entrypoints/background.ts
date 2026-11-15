import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { readStatesViaCdp, type CdpReadOptions, type ForcedReading } from '@luci-dev/capture/states';

export const READ_STATES = 'luci:read-states';
export const CAPTURE_SCREEN = 'luci:capture-screen';
export const OPEN_HELP = 'luci:open-help';
export const SET_VIEWPORT = 'luci:set-viewport';
export const SAVE_TO_PROJECT = 'luci:save-to-project';
export const CHECK_BRIDGE = 'luci:check-bridge';
export const LIST_CAPTURES = 'luci:list-captures';
export const READ_CAPTURE = 'luci:read-capture';
export const PROPOSE_RULE = 'luci:propose-rule';
export const PROJECT_TOKENS = 'luci:project-tokens';
export const SET_BRIDGE_URL = 'luci:set-bridge-url';
export const CHECK_DEBUGGER = 'luci:check-debugger';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4545';
async function bridgeUrl(): Promise<string> {
  try {
    const custom = (await browser.storage.local.get('bridgeUrl'))['bridgeUrl'];
    return typeof custom === 'string' && custom ? custom.replace(/\/+$/, '') : DEFAULT_BRIDGE_URL;
  } catch {
    return DEFAULT_BRIDGE_URL;
  }
}

/** Check if optional debugger permission has been granted (v0.4.4 Option 3). */
async function hasDebuggerPermission(): Promise<boolean> {
  try {
    return Boolean(await browser.permissions?.contains?.({ permissions: ['debugger'] }));
  } catch {
    return false;
  }
}

/** Tabs whose width Luci is emulating right now (the debugger stays attached until it is put back). */
const emulating = new Set<number>();

/**
 * Set a tab's window width for a responsive reading (height unchanged), or put it back with null:
 * the debugger is attached for the first width and detached when the width is put back.
 */
async function setViewport(tabId: number, width: number | null): Promise<void> {
  const target = { tabId };
  if (width === null) {
    if (!emulating.has(tabId)) return;
    emulating.delete(tabId);
    try {
      await browser.debugger.sendCommand(target, 'Emulation.clearDeviceMetricsOverride');
    } finally {
      await browser.debugger.detach(target).catch(() => undefined);
    }
    return;
  }
  if (!await hasDebuggerPermission()) {
    throw new Error('Debugger permission not granted. Enable it in Luci settings or help page to resize tabs.');
  }
  if (!emulating.has(tabId)) {
    await browser.debugger.attach(target, '1.3');
    emulating.add(tabId);
  }
  await browser.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', { width, height: 0, deviceScaleFactor: 0, mobile: false });
}
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

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: Record<string, unknown>) => void) => {
    const m = message as { type?: string; count?: number; options?: CdpReadOptions; section?: string; fileName?: string; markdown?: string; file?: string };
    const tabId = sender.tab?.id;
    if (m?.type === OPEN_HELP) {
      // At a section of the help page when one is asked for (a plain id only)
      const section = typeof m.section === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(m.section) ? `#${m.section}` : '';
      void browser.tabs.create({ url: `${browser.runtime.getURL('/help.html')}${section}` });
      sendResponse({ ok: true, dataUrl: '' });
      return false;
    }
    // "Send to project" direct extension bridge (v0.4.4): saves capture to .luci/design/
    if (m?.type === SAVE_TO_PROJECT) {
      if (!m.fileName || !m.markdown) {
        sendResponse({ ok: false, error: 'File name and markdown are required.' });
        return false;
      }
      void (async () => {
        try {
          const base = await bridgeUrl();
          const res = await fetch(`${base}/design`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-luci': '1' },
            body: JSON.stringify({ fileName: m.fileName, markdown: m.markdown })
          });
          const data = await res.json().catch(() => ({})) as { path?: string; replaced?: boolean; error?: string };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: { path: data.path ?? m.fileName, replaced: Boolean(data.replaced) } });
        } catch (err) {
          sendResponse({
            ok: false,
            error: `Could not connect to project bridge at 127.0.0.1:4545. Is \`luci serve\` running? (${err instanceof Error ? err.message : String(err)})`
          });
        }
      })();
      return true;
    }
    // Bridge health check
    if (m?.type === CHECK_BRIDGE) {
      void (async () => {
        try {
          const base = await bridgeUrl();
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2000);
          const res = await fetch(`${base}/health`, { signal: ctrl.signal });
          clearTimeout(timer);
          const data = await res.json().catch(() => ({})) as { ok?: boolean; project?: string; initialized?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: { project: data.project, initialized: Boolean(data.initialized), url: base } });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Set custom bridge URL (port switcher)
    if (m?.type === SET_BRIDGE_URL) {
      const msg = message as { url?: string };
      void (async () => {
        try {
          if (msg.url && msg.url.trim()) {
            await browser.storage.local.set({ bridgeUrl: msg.url.trim() });
          } else {
            await browser.storage.local.remove('bridgeUrl');
          }
          sendResponse({ ok: true, result: await bridgeUrl() });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Design check: list project captures from .luci/design/
    if (m?.type === LIST_CAPTURES) {
      void (async () => {
        try {
          const base = await bridgeUrl();
          const res = await fetch(`${base}/design`, { headers: { 'x-luci': '1' } });
          const data = await res.json().catch(() => ({})) as { files?: unknown[]; error?: string };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: data.files ?? [] });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Read one design capture from .luci/design/
    if (m?.type === READ_CAPTURE) {
      if (!m.file) {
        sendResponse({ ok: false, error: 'File name is required.' });
        return false;
      }
      void (async () => {
        try {
          const base = await bridgeUrl();
          const res = await fetch(`${base}/design/${encodeURIComponent(m.file!)}`, { headers: { 'x-luci': '1' } });
          const data = await res.json().catch(() => ({})) as { markdown?: string; error?: string };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: data.markdown ?? '' });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Propose rule from capture
    if (m?.type === PROPOSE_RULE) {
      if (!m.file) {
        sendResponse({ ok: false, error: 'File name is required.' });
        return false;
      }
      void (async () => {
        try {
          const base = await bridgeUrl();
          const res = await fetch(`${base}/rule`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-luci': '1' },
            body: JSON.stringify({ file: m.file })
          });
          const data = await res.json().catch(() => ({})) as { path?: string; existed?: boolean; rule?: string; error?: string };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: { path: data.path!, existed: Boolean(data.existed), rule: data.rule! } });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Project tokens
    if (m?.type === PROJECT_TOKENS) {
      void (async () => {
        try {
          const base = await bridgeUrl();
          const res = await fetch(`${base}/tokens`);
          const data = await res.json().catch(() => ({})) as { tokens?: { token: string; value: string }[]; error?: string };
          if (!res.ok) {
            sendResponse({ ok: false, error: data.error || `Bridge answered status ${res.status}.` });
            return;
          }
          sendResponse({ ok: true, result: data.tokens ?? [] });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      })();
      return true;
    }
    // Pixel mode: a screenshot of the visible tab (allowed by activeTab, granted by the icon click)
    if (m?.type === CAPTURE_SCREEN && sender.tab?.windowId !== undefined) {
      browser.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
        .then(dataUrl => sendResponse({ ok: true, dataUrl }))
        .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    // Check debugger permission (v0.4.4 Option 3)
    if (m?.type === CHECK_DEBUGGER) {
      void (async () => {
        const granted = await hasDebuggerPermission();
        sendResponse({ ok: true, granted });
      })();
      return true;
    }
    // Responsive capture (v0.3.4): the tab's width set through the debugger for each reading, then put back
    if (m?.type === SET_VIEWPORT && tabId !== undefined) {
      const width = (message as { width?: number | null }).width ?? null;
      void setViewport(tabId, width).then(() => sendResponse({ ok: true, dataUrl: '' }), (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      return true;
    }
    if (m?.type !== READ_STATES || tabId === undefined || typeof m.count !== 'number') return false;
    void (async () => {
      if (!await hasDebuggerPermission()) {
        sendResponse({ ok: false, error: 'Debugger permission not granted. Enable it in Luci settings or help page to capture exact CDP states.' });
        return;
      }
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
