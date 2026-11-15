import { browser } from 'wxt/browser';

async function updateStatus(): Promise<void> {
  const dot = document.getElementById('dbg-dot');
  const text = document.getElementById('dbg-status-text');
  const reqBtn = document.getElementById('dbg-request-btn') as HTMLButtonElement | null;
  const remBtn = document.getElementById('dbg-remove-btn') as HTMLButtonElement | null;
  if (!dot || !text || !reqBtn || !remBtn) return;

  let granted = false;
  try {
    granted = Boolean(await browser.permissions?.contains?.({ permissions: ['debugger'] }));
  } catch {
    granted = false;
  }

  if (granted) {
    dot.className = 'status-dot online';
    text.textContent = 'Debugger permission: Active (exact CDP states & tab resizing enabled)';
    reqBtn.style.display = 'none';
    remBtn.style.display = 'inline-block';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Debugger permission: Optional (CSS rules & frame fallback active)';
    reqBtn.style.display = 'inline-block';
    remBtn.style.display = 'none';
  }
}

function init(): void {
  void updateStatus();

  document.getElementById('dbg-request-btn')?.addEventListener('click', async () => {
    try {
      const granted = await browser.permissions.request({ permissions: ['debugger'] });
      void updateStatus();
      if (!granted) {
        console.info('Luci: debugger permission request was dismissed.');
      }
    } catch (err) {
      console.warn('Luci: could not request debugger permission:', err);
    }
  });

  document.getElementById('dbg-remove-btn')?.addEventListener('click', async () => {
    try {
      await browser.permissions.remove({ permissions: ['debugger'] });
      void updateStatus();
    } catch (err) {
      console.warn('Luci: could not remove debugger permission:', err);
    }
  });

  try {
    browser.permissions?.onAdded?.addListener?.(() => void updateStatus());
    browser.permissions?.onRemoved?.addListener?.(() => void updateStatus());
  } catch {
    // Unsupported or mocked in some contexts
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
