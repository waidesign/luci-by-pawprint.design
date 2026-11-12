/** Picker helpers (FR2, FR3, FR6): what is under the pointer, and moving to the parent or a child. */
import { eligibility, type Eligibility } from '../eligibility.js';
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

/** Whether an element can be picked, using its computed background. */
export function eligibilityOf(el: Element): Eligibility {
  const bg = el.ownerDocument.defaultView?.getComputedStyle(el).backgroundImage;
  return eligibility({ tag: el.tagName, ...(bg ? { backgroundImage: bg } : {}) });
}

/** "h1  640 × 56" for the hover label. */
export function hoverLabel(el: Element): string {
  const r = el.getBoundingClientRect();
  return `${el.tagName.toLowerCase()}  ${Math.round(r.width)} × ${Math.round(r.height)}`;
}
