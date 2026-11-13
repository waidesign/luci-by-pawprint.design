/** Put the toolbar on a page, inside its own shadow root (FR1). Both shells call this. */
import { h, render } from 'preact';
import type { CaptureSettings } from '@luci/format/capture';
import { LUCI_UI_ATTRIBUTE } from '../dom.js';
import { TOOLBAR_CSS } from './styles.js';
import { Toolbar } from './toolbar.js';
import type { ForcedStatesReader, Output } from './tools.js';
import { memoryBasketStore, type BasketStore } from './basket.js';

export const TOOLBAR_TAG = 'luci-toolbar';

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
}

export interface ToolbarHandle {
  host: HTMLElement;
  /** Capture the colour of a pixel, as the eyedropper does (e.g. "#0f62fe"). */
  pickPixel(hex: string): void;
  destroy(): void;
}

/** Mount the toolbar. Mounting again on the same page returns the existing toolbar's host, replaced. */
export function mountToolbar(options: MountOptions = {}): ToolbarHandle {
  const doc = options.doc ?? document;
  doc.querySelector(TOOLBAR_TAG)?.remove();
  const host = doc.createElement(TOOLBAR_TAG);
  host.setAttribute(LUCI_UI_ATTRIBUTE, '');
  doc.documentElement.appendChild(host);
  // Open so tests and assistive tools can see inside; styles stay isolated either way
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = TOOLBAR_CSS;
  root.appendChild(style);
  const mountPoint = doc.createElement('div');
  root.appendChild(mountPoint);

  let pixelInput: ((hex: string) => void) | null = null;
  const destroy = () => {
    render(null, mountPoint);
    host.remove();
  };
  render(h(Toolbar, {
    doc,
    settings: options.settings ?? {},
    ...(options.onSettingsChange ? { onSettingsChange: options.onSettingsChange } : {}),
    ...(options.onOutput ? { onOutput: options.onOutput } : {}),
    ...(options.readForcedStates ? { readForcedStates: options.readForcedStates } : {}),
    basket: options.basket ?? memoryBasketStore(),
    onClose: () => { destroy(); options.onClose?.(); },
    registerPixelInput: (pick: (hex: string) => void) => { pixelInput = pick; }
  }), mountPoint);

  return { host, pickPixel: (hex: string) => pixelInput?.(hex), destroy };
}
