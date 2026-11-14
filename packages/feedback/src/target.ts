/**
 * What an item points at (FR23, FR24): from a clicked element or a text selection, the selector
 * and text that always work, plus the components and source file a framework adapter finds (React
 * first, FR25), and a few computed styles for the "detailed" level.
 */
import { elementName, implicitRole, selectorFor } from '@luci/capture';
import type { FeedbackItem, SourceLocation } from '@luci/format/feedback';
import { PAGE_FOLDER, firstUserLocation, frameResolver, reactInfo, type FrameResolver, type FrameworkInfo, type ServerResolver } from './react.js';
import { sourceMapLoader } from './sourcemap.js';
import { svelteInfo } from './svelte.js';
import { vueInfo } from './vue.js';

export type Target = FeedbackItem['target'];

/** The computed styles the "detailed" level lists. */
export const DETAIL_STYLES = ['display', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'margin', 'border-radius', 'gap'] as const;
/** At most this many characters of an element's text. */
export const MAX_TEXT = 160;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const shorten = (text: string, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** "button", "h2 (heading)", "a (link)": tag and role, never classes. */
export function nameOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  return elementName(tag, el.getAttribute('role') ?? implicitRole(tag, { href: el.hasAttribute('href'), type: el.getAttribute('type') ?? undefined }));
}

/** The styles worth listing: the ones that are set (not empty, "none", "normal" or 0). */
export function detailStyles(el: Element): Record<string, string> {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const p of DETAIL_STYLES) {
    const v = cs.getPropertyValue(p).trim();
    if (v && !/^(none|normal|0px|auto|rgba\(0, 0, 0, 0\))$/.test(v)) out[p] = v;
  }
  return out;
}

export interface Adapter {
  name: string;
  read(el: Element): FrameworkInfo | null;
}
export const ADAPTERS: readonly Adapter[] = [
  { name: 'react', read: reactInfo },
  { name: 'vue', read: vueInfo },
  { name: 'svelte', read: svelteInfo }
];

/** Fetch a module's text from the page's own server (for its source map). */
const sameOriginText = (doc: Document) => async (url: string): Promise<string | null> => {
  try {
    if (new URL(url, doc.location.href).origin !== doc.location.origin && !url.startsWith('data:')) return null;
    const res = await fetch(url, { credentials: 'same-origin' });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

// One loader per page: each module and its map are fetched once
let browserMaps: ReturnType<typeof sourceMapLoader> | null = null;
const resolvers = new WeakMap<object, FrameResolver>();
/** The resolver for this page; with `serverResolve` (luci serve), server components get exact lines too. */
export function resolverFor(doc: Document, serverResolve?: ServerResolver): FrameResolver {
  browserMaps ??= sourceMapLoader(sameOriginText(doc));
  const key = (serverResolve ?? resolvers) as object;
  if (!resolvers.has(key)) resolvers.set(key, frameResolver(browserMaps, serverResolve));
  return resolvers.get(key)!;
}

/**
 * The page's own file among the components' files (outermost first): a route file ("page.tsx",
 * Next's App Router, or SvelteKit's "+page.svelte"), then one in pages/, routes/, views/ or
 * screens/, then any in app/.
 */
export function pageFile(files: readonly string[]): string | undefined {
  const norm = (f: string) => f.replace(/\\/g, '/');
  return files.find(f => /(^|\/)(\+?page|route)\.(?:[jt]sx?|vue|svelte)$/.test(norm(f)))
    ?? files.find(f => /(^|\/)(pages|routes|views|screens)\//.test(norm(f)))
    ?? files.find(f => PAGE_FOLDER.test(norm(f)));
}

/** The first framework adapter that recognizes this element (React, Vue or Svelte). */
export function frameworkInfo(el: Element): FrameworkInfo | null {
  for (const adapter of ADAPTERS) {
    const info = adapter.read(el);
    if (info) return info;
  }
  return null;
}

/** The framework details of an element: components, its JSX location, and the page component's file. */
export async function frameworkDetails(el: Element, resolve: FrameResolver = resolverFor(el.ownerDocument)): Promise<{ components?: string[]; source?: SourceLocation; pageSource?: string }> {
  const info = frameworkInfo(el);
  if (!info) return {};
  const source = await firstUserLocation(info.frames, resolve);
  const files = await Promise.all(info.componentFrames.map(f => firstUserLocation(f, resolve).then(s => s?.file)));
  const pageSource = pageFile(files.filter((f): f is string => Boolean(f)));
  return {
    ...(info.components.length ? { components: info.components } : {}),
    ...(source ? { source } : {}),
    ...(pageSource ? { pageSource } : {})
  };
}

/** The element a selection is in: the nearest element holding both ends. */
export function selectionElement(range: Range): Element | null {
  const node = range.commonAncestorContainer;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

/**
 * Describe an element (or the selected text in it) for a feedback item. `pageSource` comes back
 * separately: it belongs on the item's page.
 */
export async function describeTarget(el: Element, options: { selectedText?: string; resolve?: FrameResolver; serverResolve?: ServerResolver } = {}): Promise<{ target: Target; pageSource?: string }> {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const r = el.getBoundingClientRect();
  const text = shorten(collapse((el as HTMLElement).innerText ?? el.textContent ?? ''));
  const selected = options.selectedText ? shorten(collapse(options.selectedText)) : '';
  const details = await frameworkDetails(el, options.resolve ?? resolverFor(doc, options.serverResolve));
  const target: Target = {
    kind: selected ? 'text' : 'element',
    selector: selectorFor(el, el.getRootNode() as Document | ShadowRoot),
    element: nameOf(el),
    ...(text ? { text } : {}),
    ...(selected ? { selectedText: selected } : {}),
    ...(details.components ? { components: details.components } : {}),
    ...(details.source ? { source: details.source } : {}),
    styles: detailStyles(el),
    rect: { x: Math.round(r.left + win.scrollX), y: Math.round(r.top + win.scrollY), width: Math.round(r.width), height: Math.round(r.height) }
  };
  return { target, ...(details.pageSource ? { pageSource: details.pageSource } : {}) };
}
