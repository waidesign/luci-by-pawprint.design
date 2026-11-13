/** Picker helpers (FR2, FR3, FR6): what is under the pointer, and moving to the parent or a child. */
import { eligibility, isImageLike, type Eligibility } from '../eligibility.js';
import { LUCI_UI_ATTRIBUTE } from '../dom.js';

/** True when the node is part of Luci's own UI (the toolbar host or anything inside it). */
export function isLuciUi(node: Node | null): boolean {
  for (let n: Node | null = node; n; n = n instanceof ShadowRoot ? n.host : n.parentNode) {
    if (n instanceof Element && n.hasAttribute(LUCI_UI_ATTRIBUTE)) return true;
  }
  return false;
}

/** The deepest page element an event happened on, inside shadow roots too; null for Luci's UI. */
export function eventTarget(event: Event): Element | null {
  const path = event.composedPath();
  if (path.some(n => n instanceof Element && n.hasAttribute(LUCI_UI_ATTRIBUTE))) return null;
  const first = path.find((n): n is Element => n instanceof Element);
  return first ?? null;
}

/**
 * The deepest page element at a point, inside open shadow roots too, skipping Luci's own UI. The
 * picker uses this under a layer that takes every pointer event, so the page never receives them.
 */
export function elementAt(doc: Document, x: number, y: number): Element | null {
  const deepest = (root: Document | ShadowRoot): Element | null => {
    for (const el of root.elementsFromPoint(x, y)) {
      if (isLuciUi(el)) continue;
      if (el.shadowRoot && el.shadowRoot !== root) {
        const inner = deepest(el.shadowRoot);
        if (inner) return inner;
      }
      return el;
    }
    return null;
  };
  return deepest(doc);
}

/** The nearest element at or above `el` that can scroll in this direction, if any. */
export function scrollableAncestor(el: Element | null, dx: number, dy: number): Element | null {
  for (let n: Element | null = el; n && n !== n.ownerDocument.documentElement && n !== n.ownerDocument.body; n = parentOf(n)) {
    const cs = n.ownerDocument.defaultView?.getComputedStyle(n);
    if (!cs) continue;
    const canY = dy !== 0 && /(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight;
    const canX = dx !== 0 && /(auto|scroll|overlay)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth;
    if (canY || canX) return n;
  }
  return null;
}

/** The parent element, crossing out of a shadow root to its host. Null at the root. */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** The first child element, entering a shadow root when there is one. */
export function firstChildOf(el: Element): Element | null {
  return el.shadowRoot?.firstElementChild ?? el.firstElementChild;
}

const imageInput = (el: Element) => {
  const bg = el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage;
  return { tag: el.tagName, ...(bg ? { backgroundImage: bg } : {}) };
};

/** Whether an element can be picked with a tool, using its computed background. */
export function eligibilityOf(el: Element, tool?: string | null): Eligibility {
  return eligibility(imageInput(el), { imageTool: tool === 'image' });
}

/**
 * For the Image tool: the image at a point, even under a layer over it (a tint, a caption box, a
 * link stretched across a card). The topmost image-like element there, else the element itself.
 */
export function imageAt(doc: Document, x: number, y: number): Element | null {
  const top = elementAt(doc, x, y);
  if (!top || isImageLike(imageInput(top))) return top;
  // An svg's own shapes are part of the illustration
  const svg = top.closest('svg');
  if (svg && !isLuciUi(svg)) return svg;
  const stack = (root: Document | ShadowRoot): Element[] => root.elementsFromPoint(x, y).flatMap(el =>
    isLuciUi(el) ? [] : el.shadowRoot && el.shadowRoot !== root ? [...stack(el.shadowRoot), el] : [el]);
  return stack(doc).find(el => isImageLike(imageInput(el))) ?? top;
}

/** "h1  640 × 56" for the hover label. */
export function hoverLabel(el: Element): string {
  const r = el.getBoundingClientRect();
  return `${el.tagName.toLowerCase()}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
}
