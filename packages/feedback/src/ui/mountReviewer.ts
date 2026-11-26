/**
 * Mount the extension Reviewer toolbar or the one-time fresh-install choice inside an isolated
 * shadow root (same isolation and replace-event protocol as Capture's mountToolbar).
 */
import { h, render } from 'preact';
import {
  LUCI_UI_ATTRIBUTE,
  TOOLBAR_REPLACE_EVENT,
  type ModeSwitchProps
} from '@luci-dev/capture';
import { loadFonts } from '@luci-dev/ui';
import { FEEDBACK_CSS } from './styles.js';
import { ExtensionChooser, Reviewer, localStorageReviewerStore, type ReviewerStore } from './reviewer.js';

export { Reviewer, ExtensionChooser, captureReviewElement, localStorageReviewerStore, type ReviewerProps, type ReviewerStore, type ExtensionChooserProps } from './reviewer.js';
export const REVIEWER_TAG = 'luci-reviewer';
export const EXTENSION_CHOOSER_TAG = 'luci-welcome';

export interface ReviewerMountOptions {
  doc?: Document;
  store?: ReviewerStore;
  modes?: ModeSwitchProps;
  onClose?: () => void;
}

export interface ReviewerHandle {
  host: HTMLElement;
  destroy(): void;
}

function attachIsolatedShadow(doc: Document, tag: string): { host: HTMLElement; mountPoint: HTMLDivElement } {
  doc.dispatchEvent(new CustomEvent(TOOLBAR_REPLACE_EVENT));
  doc.querySelector(tag)?.remove();
  const host = doc.createElement(tag);
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
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }
  const style = doc.createElement('style');
  style.textContent = FEEDBACK_CSS;
  root.appendChild(style);
  const mountPoint = doc.createElement('div');
  root.appendChild(mountPoint);
  return { host, mountPoint };
}

export function mountReviewer(options: ReviewerMountOptions = {}): ReviewerHandle {
  const doc = options.doc ?? document;
  const { host, mountPoint } = attachIsolatedShadow(doc, REVIEWER_TAG);
  const destroy = () => {
    doc.removeEventListener(TOOLBAR_REPLACE_EVENT, destroy);
    render(null, mountPoint);
    host.remove();
  };
  doc.addEventListener(TOOLBAR_REPLACE_EVENT, destroy);
  render(h(Reviewer, {
    doc,
    store: options.store ?? localStorageReviewerStore(),
    ...(options.modes ? { modes: options.modes } : {}),
    onClose: () => { destroy(); options.onClose?.(); }
  }), mountPoint);
  return { host, destroy };
}

export interface ExtensionChooserOptions {
  doc?: Document;
  onChoose: (tab: 'reviewer' | 'capture') => void;
  onClose?: () => void;
}

/** One-time fresh-install chooser for the Chrome extension: "Review a site" or "Capture designs". */
export function mountExtensionChooser(options: ExtensionChooserOptions): ReviewerHandle {
  const doc = options.doc ?? document;
  const { host, mountPoint } = attachIsolatedShadow(doc, EXTENSION_CHOOSER_TAG);
  const destroy = () => {
    doc.removeEventListener(TOOLBAR_REPLACE_EVENT, destroy);
    render(null, mountPoint);
    host.remove();
  };
  doc.addEventListener(TOOLBAR_REPLACE_EVENT, destroy);
  render(h(ExtensionChooser, {
    doc,
    onChoose: (tab) => { destroy(); options.onChoose(tab); },
    onClose: () => { destroy(); options.onClose?.(); }
  }), mountPoint);
  return { host, destroy };
}
