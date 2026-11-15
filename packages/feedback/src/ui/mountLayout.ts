/** Put Layout mode on a page, in its own shadow root (the page's preview stylesheet is the only thing it adds outside). */
import { h, render } from 'preact';
import { LUCI_UI_ATTRIBUTE, type ModeSwitchProps, type StorageLike } from '@luci-dev/capture';
import { loadFonts } from '@luci-dev/ui';
import type { FeedbackBackend } from '../backend.js';
import { FEEDBACK_CSS } from './styles.js';
import { Layout } from './layout.js';

export const LAYOUT_TAG = 'luci-layout';

export interface LayoutMountOptions {
  backend: FeedbackBackend;
  doc?: Document;
  modes?: ModeSwitchProps;
  connectNote?: string;
  onClose?: () => void;
  /** Active project details (from luci serve /health). */
  projectInfo?: {
    get: () => Promise<{ project?: string; name?: string; url?: string } | null>;
    setUrl?: (url: string) => Promise<void>;
  };
  store?: StorageLike;
}

export function mountLayout(options: LayoutMountOptions): { host: HTMLElement; destroy(): void } {
  const doc = options.doc ?? document;
  doc.querySelector(LAYOUT_TAG)?.remove();
  const host = doc.createElement(LAYOUT_TAG);
  host.setAttribute(LUCI_UI_ATTRIBUTE, '');
  doc.documentElement.appendChild(host);
  loadFonts(doc);
  const root = host.attachShadow({ mode: 'open' });
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) e.stopPropagation();
    });
  }
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
  const style = doc.createElement('style');
  style.textContent = FEEDBACK_CSS;
  root.appendChild(style);
  const mountPoint = doc.createElement('div');
  root.appendChild(mountPoint);
  // Unmounting runs Layout's cleanup, which takes the preview off the page
  const destroy = () => {
    render(null, mountPoint);
    host.remove();
  };
  render(h(Layout, {
    doc,
    backend: options.backend,
    ...(options.modes ? { modes: options.modes } : {}),
    ...(options.connectNote ? { connectNote: options.connectNote } : {}),
    ...(options.projectInfo ? { projectInfo: options.projectInfo } : {}),
    ...(options.store ? { store: options.store } : {}),
    onClose: () => { destroy(); options.onClose?.(); }
  }), mountPoint);
  return { host, destroy };
}
