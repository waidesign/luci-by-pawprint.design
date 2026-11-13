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

export function addToBasket(items: readonly BasketItem[], capture: Capture): BasketItem[] {
  return [...items, { id: newId(), name: displayName(capture), addedAt: today(), capture }];
}

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

/** One item on its own; its file and name follow the name it has in the basket. */
export function exportItem(item: BasketItem, settings: CaptureSettings): { fileName: string; markdown: string } {
  const capture = { ...item.capture, meta: { ...item.capture.meta, name: toCaptureName(item.name) } } as Capture;
  return { fileName: captureFileName(capture.meta), markdown: formatCapture(capture, settings) };
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
