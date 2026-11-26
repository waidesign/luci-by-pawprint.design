import { browser } from 'wxt/browser';

const SETTINGS_KEY = 'captureSettings';

/**
 * The help page's debugger status. `debugger` is a required permission (Chrome does not allow it as
 * optional), so what the person controls is Luci's own switch in settings (useDebugger, on by default).
 */
async function updateStatus(): Promise<void> {
  const dot = document.getElementById('dbg-dot');
  const text = document.getElementById('dbg-status-text');
  if (!dot || !text) return;

  let granted = false;
  try {
    granted = Boolean(await browser.permissions?.contains?.({ permissions: ['debugger'] }));
  } catch {
    granted = false;
  }
  let useDebugger = true;
  try {
    const settings = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as { useDebugger?: boolean } | undefined;
    useDebugger = settings?.useDebugger ?? true;
  } catch {
    // No storage here: the default stands
  }

  const on = granted && useDebugger;
  dot.className = `status-dot ${on ? 'online' : 'offline'}`;
  text.textContent = !granted
    ? 'Chrome is not letting Luci use the debugger.'
    : useDebugger
      ? "Luci's switch is on: Luci uses the debugger during captures."
      : "Luci's switch is off: Luci never attaches the debugger.";
}

function init(): void {
  void updateStatus();
  try {
    browser.storage?.onChanged?.addListener?.((changes) => {
      if (SETTINGS_KEY in changes) void updateStatus();
    });
  } catch {
    // Unsupported or mocked in some contexts
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
