import { describe, expect, it } from 'vitest';
import { createViewportControl, localBridgeUrl, pickToolbarFrame, type DebuggerApi } from '../src/background-core.js';

/** A fake chrome.debugger that behaves like Chrome's: commands fail unless attached. */
function fakeDebugger() {
  const attached = new Set<number>();
  const calls: string[] = [];
  const api: DebuggerApi = {
    async attach({ tabId }) {
      calls.push(`attach ${tabId}`);
      if (attached.has(tabId)) throw new Error('Another debugger is already attached to the tab with id: ' + tabId);
      attached.add(tabId);
    },
    async detach({ tabId }) {
      calls.push(`detach ${tabId}`);
      if (!attached.delete(tabId)) throw new Error('Debugger is not attached to the tab with id: ' + tabId);
    },
    async sendCommand({ tabId }, method) {
      calls.push(`${method} ${tabId}`);
      if (!attached.has(tabId)) throw new Error('Debugger is not attached to the tab with id: ' + tabId);
      return {};
    }
  };
  return { api, attached, calls };
}

describe('background worker (B-39)', () => {
  it('attaches again after Chrome detaches the debugger mid-emulation', async () => {
    const d = fakeDebugger();
    const viewport = createViewportControl(d.api, async () => true);
    await viewport.set(7, 375);
    expect(d.attached.has(7)).toBe(true);

    // The person presses Cancel on Chrome's "debugging this browser" bar: Chrome detaches, onDetach fires
    d.attached.delete(7);
    viewport.forget(7);

    d.calls.length = 0;
    await viewport.set(7, 768);
    expect(d.calls).toEqual(['attach 7', 'Emulation.setDeviceMetricsOverride 7']);
    await viewport.set(7, null);
    expect(d.attached.has(7)).toBe(false);
  });

  it('recovers even when onDetach was missed: the failed command forgets the tab', async () => {
    const d = fakeDebugger();
    const viewport = createViewportControl(d.api, async () => true);
    await viewport.set(3, 375);
    d.attached.delete(3); // detached without an event reaching this worker
    await expect(viewport.set(3, 768)).rejects.toThrow(/not attached/);
    await viewport.set(3, 768);
    expect(d.attached.has(3)).toBe(true);
  });

  it('puts the width back after a worker restart, and reuses a debugger still attached', async () => {
    const d = fakeDebugger();
    await d.api.attach({ tabId: 5 }, '1.3'); // attached by the worker before it restarted
    const fresh = createViewportControl(d.api, async () => true);
    await fresh.set(5, 400); // "already attached" is not an error
    await fresh.set(5, null);
    expect(d.attached.has(5)).toBe(false);

    await d.api.attach({ tabId: 6 }, '1.3');
    const restarted = createViewportControl(d.api, async () => true);
    await restarted.set(6, null); // does not remember the tab, still clears and detaches
    expect(d.calls.slice(-2)).toEqual(['Emulation.clearDeviceMetricsOverride 6', 'detach 6']);
    expect(d.attached.has(6)).toBe(false);
  });

  it('accepts only luci serve on this computer as the bridge', () => {
    expect(localBridgeUrl('http://127.0.0.1:4545')).toBe('http://127.0.0.1:4545');
    expect(localBridgeUrl('http://localhost:4546/')).toBe('http://localhost:4546');
    expect(localBridgeUrl(' http://[::1]:4545 ')).toBe('http://[::1]:4545');
    for (const bad of ['https://example.com', 'https://evil.example.com:4545', 'http://192.168.1.5:4545', 'http://127.0.0.1.evil.com:4545',
      'http://user:pw@127.0.0.1:4545', 'http://127.0.0.1:4545/steal', 'file:///C:/', 'javascript:alert(1)', '4545', '', undefined, 42]) {
      expect(localBridgeUrl(bad), String(bad)).toBeNull();
    }
  });

  it('targets Storybook preview canvas iframe when present, and top frame otherwise', () => {
    expect(pickToolbarFrame([
      { frameId: 0, result: false },
      { frameId: 42, result: true }
    ])).toBe(42);
    // Standalone iframe.html (top frame itself is Storybook canvas) -> null so we inject into top frame
    expect(pickToolbarFrame([{ frameId: 0, result: true }])).toBeNull();
    // Normal website -> null
    expect(pickToolbarFrame([{ frameId: 0, result: false }, { frameId: 7, result: false }])).toBeNull();
    expect(pickToolbarFrame([])).toBeNull();
    expect(pickToolbarFrame(undefined)).toBeNull();
  });
});
