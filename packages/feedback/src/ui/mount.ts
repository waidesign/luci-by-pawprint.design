/** Put the Feedback layer on a page, in its own shadow root, apart from the page and its styles. */
import { h, render } from 'preact';
import { LUCI_UI_ATTRIBUTE } from '@luci/capture';
import type { FeedbackBackend } from '../backend.js';
import { FEEDBACK_CSS } from './styles.js';
import { DEFAULT_FEEDBACK_SETTINGS, Feedback, type FeedbackSettings } from './feedback.js';

export const FEEDBACK_TAG = 'luci-feedback';

export interface FeedbackMountOptions {
  backend: FeedbackBackend;
  doc?: Document;
  connectNote?: string;
  settings?: FeedbackSettings;
  onSettingsChange?: (settings: FeedbackSettings) => void;
  onCapture?: () => void;
  onConnect?: () => Promise<string | null>;
  onClose?: () => void;
  pollMs?: number;
}

export interface FeedbackHandle {
  host: HTMLElement;
  destroy(): void;
}

export function mountFeedback(options: FeedbackMountOptions): FeedbackHandle {
  const doc = options.doc ?? document;
  doc.querySelector(FEEDBACK_TAG)?.remove();
  const host = doc.createElement(FEEDBACK_TAG);
  host.setAttribute(LUCI_UI_ATTRIBUTE, '');
  doc.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  // Typing in Luci's fields, and clicks on its UI, never reach the app (its shortcuts, "click outside" handlers)
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
  const destroy = () => {
    render(null, mountPoint);
    host.remove();
  };
  render(h(Feedback, {
    doc,
    backend: options.backend,
    settings: options.settings ?? DEFAULT_FEEDBACK_SETTINGS,
    ...(options.connectNote ? { connectNote: options.connectNote } : {}),
    ...(options.onSettingsChange ? { onSettingsChange: options.onSettingsChange } : {}),
    ...(options.onCapture ? { onCapture: options.onCapture } : {}),
    ...(options.onConnect ? { onConnect: options.onConnect } : {}),
    ...(options.pollMs ? { pollMs: options.pollMs } : {}),
    onClose: () => { destroy(); options.onClose?.(); }
  }), mountPoint);
  return { host, destroy };
}
