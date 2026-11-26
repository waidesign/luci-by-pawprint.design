/**
 * The background worker's logic that does not need Chrome itself: the bridge address check and the
 * responsive-capture viewport (debugger) bookkeeping. background.ts wires these to `browser`; tests
 * drive them with fakes.
 */

export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4545';

/**
 * The bridge address if it is `luci serve` on this machine (http, 127.0.0.1 / localhost / [::1], any
 * port), without a trailing slash; null for anything else. The bridge only ever listens on loopback,
 * so another address can only be a mistake or someone trying to send captures off the machine (B-39).
 */
export function localBridgeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'http:') return null;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  return `${url.protocol}//${url.host}`;
}

export interface FrameProbeResult {
  frameId: number;
  result?: unknown;
}

/**
 * Self-contained DOM check run in every frame of the active tab via `scripting.executeScript`
 * to locate Storybook's preview canvas iframe (`#storybook-root` or `body.sb-show-main`).
 */
export function isStorybookCanvasFrame(): boolean {
  return Boolean(
    typeof document !== 'undefined' &&
    (document.getElementById('storybook-root') || document.querySelector('body.sb-show-main'))
  );
}

/**
 * Given frame probe results from `scripting.executeScript({ target: { tabId, allFrames: true } })`,
 * returns the child frameId of Storybook's preview canvas iframe, or null to inject into the top frame.
 */
export function pickToolbarFrame(results: readonly FrameProbeResult[] | null | undefined): number | null {
  if (!results?.length) return null;
  const childCanvas = results.find(r => r.frameId !== 0 && r.result === true);
  return childCanvas ? childCanvas.frameId : null;
}

type Target = { tabId: number };
export interface DebuggerApi {
  attach(target: Target, version: string): Promise<void>;
  detach(target: Target): Promise<void>;
  sendCommand(target: Target, method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Sets a tab's window width for responsive readings and puts it back. The debugger stays attached
 * from the first width until the width is put back. `forget` is called when Chrome detaches the
 * debugger itself (the person pressed Cancel on Chrome's bar, opened DevTools) or the tab closes, so
 * the next reading attaches again instead of failing with "Debugger is not attached" (B-39).
 */
export function createViewportControl(debuggerApi: DebuggerApi, hasPermission: () => Promise<boolean>) {
  const emulating = new Set<number>();
  return {
    emulating,
    forget(tabId: number) { emulating.delete(tabId); },
    async set(tabId: number, width: number | null): Promise<void> {
      const target = { tabId };
      if (width === null) {
        // Put back even when this worker does not remember attaching (it may have restarted since)
        const known = emulating.delete(tabId);
        try {
          await debuggerApi.sendCommand(target, 'Emulation.clearDeviceMetricsOverride');
        } catch (err) {
          if (known) throw err;
        } finally {
          await debuggerApi.detach(target).catch(() => undefined);
        }
        return;
      }
      if (!await hasPermission()) {
        throw new Error('Debugger permission not granted. Enable it in Luci settings or help page to resize tabs.');
      }
      if (!emulating.has(tabId)) {
        try {
          await debuggerApi.attach(target, '1.3');
        } catch (err) {
          // Still attached from before a worker restart: keep using it
          if (!/already attached/i.test(err instanceof Error ? err.message : String(err))) throw err;
        }
        emulating.add(tabId);
      }
      try {
        await debuggerApi.sendCommand(target, 'Emulation.setDeviceMetricsOverride', { width, height: 0, deviceScaleFactor: 0, mobile: false });
      } catch (err) {
        // Detached under us: forget it, so the next try attaches again
        if (/not attached/i.test(err instanceof Error ? err.message : String(err))) emulating.delete(tabId);
        throw err;
      }
    }
  };
}
