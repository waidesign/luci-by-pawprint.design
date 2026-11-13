/**
 * The capture basket (FR18, FR19): picks collect here across pages and sites, can be renamed or
 * removed, and export as one file (scope: collection) or one at a time. Where items are kept is
 * up to the shell: the extension keeps them in its storage, so they survive navigation and restarts.
 */
import {
  captureFileName,
  collectionFileName,
  formatCapture,
  formatCollection,
  toCaptureName,
  type BasketItem,
  type Capture,
  type CaptureSettings
} from '@luci/format/capture';
import { referenceFileName } from './screenshot.js';
import { dataUrlBytes, zip, type ZipEntry } from './zip.js';

export interface BasketStore {
  load(): Promise<BasketItem[]>;
  save(items: BasketItem[]): Promise<void>;
}

/** Kept in memory: lost when the page is left. The default when a shell gives no store. */
export function memoryBasketStore(initial: BasketItem[] = []): BasketStore {
  let items = [...initial];
  return {
    load: async () => [...items],
    save: async (next) => { items = [...next]; }
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** "text-heading-1" -> "Text heading 1", the name an item starts with. */
export const displayName = (capture: Capture) => {
  const words = capture.meta.name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Add a capture; `edited` is the file as the user changed it by hand, when they did. A reference
 * screenshot is kept as its small copy; exports give it a file name of their own.
 */
export function addToBasket(items: readonly BasketItem[], capture: Capture, edited?: string, screenshot?: BasketItem['screenshot']): BasketItem[] {
  const { reference: _single, ...meta } = capture.meta;
  return [...items, { id: newId(), name: displayName(capture), addedAt: today(), capture: { ...capture, meta } as Capture, ...(edited ? { edited } : {}), ...(screenshot ? { screenshot } : {}) }];
}

const extOf = (dataUrl: string) => (dataUrl.startsWith('data:image/png') ? 'png' : 'jpg');

export function renameInBasket(items: readonly BasketItem[], id: string, name: string): BasketItem[] {
  const trimmed = name.trim();
  return trimmed ? items.map(i => (i.id === id ? { ...i, name: trimmed } : i)) : [...items];
}

export const removeFromBasket = (items: readonly BasketItem[], id: string): BasketItem[] => items.filter(i => i.id !== id);

/** The default name of a basket export, e.g. "basket-2026-11-13". */
export const defaultBasketName = () => `basket-${today()}`;

/** The whole basket as one file (FR19). */
export function exportBasket(items: readonly BasketItem[], settings: CaptureSettings, name = defaultBasketName()): { fileName: string; markdown: string } {
  const slug = toCaptureName(name);
  return { fileName: collectionFileName(slug), markdown: formatCollection({ name: slug, captured: today(), items: [...items] }, settings) };
}

/**
 * The whole basket as one .zip: the collection file plus each item's reference screenshot in
 * "references/", which the file links to by relative path.
 */
export function exportBasketZip(items: readonly BasketItem[], settings: CaptureSettings, name = defaultBasketName()): { fileName: string; bytes: Uint8Array; screenshots: number } {
  const slug = toCaptureName(name);
  const references: Record<string, string> = {};
  const files: ZipEntry[] = [];
  items.forEach((item, i) => {
    if (!item.screenshot) return;
    const path = `references/${String(i + 1).padStart(2, '0')}-${toCaptureName(item.name)}.${extOf(item.screenshot.dataUrl)}`;
    references[item.id] = path;
    files.push({ name: path, data: dataUrlBytes(item.screenshot.dataUrl) });
  });
  const markdown = formatCollection({ name: slug, captured: today(), items: [...items] }, settings, { references });
  return { fileName: `${slug}.zip`, bytes: zip([{ name: collectionFileName(slug), data: markdown }, ...files]), screenshots: files.length };
}

/** One item on its own; its file and name follow the name it has in the basket. Its screenshot, if any, goes beside it. */
export function exportItem(item: BasketItem, settings: CaptureSettings): { fileName: string; markdown: string; reference?: { fileName: string; dataUrl: string } } {
  const meta = { ...item.capture.meta, name: toCaptureName(item.name) };
  const fileName = captureFileName(meta);
  const reference = item.screenshot ? { fileName: referenceFileName(fileName, extOf(item.screenshot.dataUrl)), dataUrl: item.screenshot.dataUrl } : undefined;
  const capture = { ...item.capture, meta: { ...meta, ...(reference ? { reference: reference.fileName } : {}) } } as Capture;
  return { fileName, markdown: item.edited ?? formatCapture(capture, settings), ...(reference ? { reference } : {}) };
}

/** Where an item came from, for the basket list: "example.com/pricing". */
export function sourceLabel(item: BasketItem): string {
  try {
    const u = new URL(item.capture.meta.source);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return item.capture.meta.source;
  }
}
