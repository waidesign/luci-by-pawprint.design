/**
 * The script-tag entry (`<script src="http://127.0.0.1:4545/toolbar.js"></script>`, served by
 * `luci serve`): mounts the dev toolbar once the page is ready, once per page.
 */
import { LUCI_FRAME_NAME } from '@luci-dev/capture';
import { mountDevToolbar, type DevToolbarHandle } from './devToolbar.js';

declare global {
  interface Window {
    __LUCI_BRIDGE__?: string;
    luciDevToolbar?: Promise<DevToolbarHandle>;
  }
}

export { mountDevToolbar };

// Not inside the hidden frames Luci reads other widths in (responsive capture): only the page itself
if (typeof window !== 'undefined' && !window.luciDevToolbar && window.name !== LUCI_FRAME_NAME) {
  const start = () => { window.luciDevToolbar = mountDevToolbar(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
