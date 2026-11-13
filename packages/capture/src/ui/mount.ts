/** Put the toolbar on a page, inside its own shadow root (FR1). Both shells call this. */
import { h, render } from 'preact';
import type { CaptureSettings } from '@luci/format/capture';
import { LUCI_UI_ATTRIBUTE } from '../dom.js';
import { TOOLBAR_CSS } from './styles.js';
import { Toolbar } from './toolbar.js';
import type { ForcedStatesReader, Output } from './tools.js';
import { memoryBasketStore, type BasketStore } from './basket.js';

export const TOOLBAR_TAG = 'luci-toolbar';
const REPLACE_EVENT = 'luci-toolbar-replace';

export interface MountOptions {
  doc?: Document;
  settings?: CaptureSettings;
  onSettingsChange?: (settings: CaptureSettings) => void;
  onOutput?: (output: Output) => void;
  onClose?: () => void;
  /** Exact component states through the browser's debugger (the extension provides it). */
  readForcedStates?: ForcedStatesReader;
  /** Where the basket is kept. Default: in this page's memory only. */
  basket?: BasketStore;
  /** A screenshot of the visible page (data URL) for Pixel mode; without it, the browser's eyedropper is used. */
  captureScreen?: () => Promise<string>;
  /** Opens a help page (the extension opens its own); adds a "?" button. */
  onHelp?: () => void;
}

export interface ToolbarHandle {
  host: HTMLElement;
  /** Capture the color of a pixel, as the eyedropper does (e.g. "#0f62fe"). */
  pickPixel(hex: string): void;
  destroy(): void;
}

/** Mount the toolbar. Mounting again on the same page returns the existing toolbar's host, replaced. */
export function mountToolbar(options: MountOptions = {}): ToolbarHandle {
  const doc = options.doc ?? document;
  // An older toolbar (e.g. from before the extension was reloaded, in another JavaScript world) shuts
  // itself down, page listeners included: DOM events reach every world
  doc.dispatchEvent(new CustomEvent(REPLACE_EVENT));
  doc.querySelector(TOOLBAR_TAG)?.remove();
  const host = doc.createElement(TOOLBAR_TAG);
  host.setAttribute(LUCI_UI_ATTRIBUTE, '');
  doc.documentElement.appendChild(host);
  // Open so tests and assistive tools can see inside; styles stay isolated either way
  const root = host.attachShadow({ mode: 'open' });
  // Typing in Luci's own fields must not reach the page (sites react to keys like "/" or "s")
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    root.addEventListener(type, (e) => {
      const t = e.composedPath()[0];
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) e.stopPropagation();
    });
  }
  const style = doc.createElement('style');
  style.textContent = TOOLBAR_CSS;
  root.appendChild(style);
  const mountPoint = doc.createElement('div');
  root.appendChild(mountPoint);

  let pixelInput: ((hex: string) => void) | null = null;
  const destroy = () => {
    doc.removeEventListener(REPLACE_EVENT, destroy);
    render(null, mountPoint);
    host.remove();
  };
  doc.addEventListener(REPLACE_EVENT, destroy);
  render(h(Toolbar, {
    doc,
    settings: options.settings ?? {},
    ...(options.onSettingsChange ? { onSettingsChange: options.onSettingsChange } : {}),
    ...(options.onOutput ? { onOutput: options.onOutput } : {}),
    ...(options.readForcedStates ? { readForcedStates: options.readForcedStates } : {}),
    basket: options.basket ?? memoryBasketStore(),
    ...(options.captureScreen ? { captureScreen: options.captureScreen } : {}),
    ...(options.onHelp ? { onHelp: options.onHelp } : {}),
    onClose: () => { destroy(); options.onClose?.(); },
    registerPixelInput: (pick: (hex: string) => void) => { pixelInput = pick; }
  }), mountPoint);

  return { host, pickPixel: (hex: string) => pixelInput?.(hex), destroy };
}
