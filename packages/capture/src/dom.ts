/**
 * The DOM reader: builds the PageSnapshot every tool uses, from the live page. Runs in the browser
 * (both toolbar shells). Values come from getComputedStyle; authored values (var(), clamp(), em...)
 * come from the stylesheet rules that match each element, where the page lets us read them.
 */
import { SNAPSHOT_PROPERTIES, type ElementSnapshot, type PageSnapshot, type SnapshotProperty } from './model.js';
import { implicitRole } from './naming.js';
import { hasRules, isDocument, isMediaRule, isShadowRoot, isStyleRule, isSupportsRule, mediaMatches, windowOf } from './realm.js';

/** Elements the toolbar adds to the page carry this attribute; the reader skips them. */
export const LUCI_UI_ATTRIBUTE = 'data-luci-ui';

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'head', 'title', 'template', 'noscript', 'base', 'br', 'wbr']);
const INHERITED = new Set<SnapshotProperty>(['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-style', 'text-transform', 'color', 'fill', 'stroke']);
/** Not inherited, so with no declaration their value can only be the browser's default. */
const BOX_PROPERTIES: readonly SnapshotProperty[] = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
/** Selectors that depend on interaction or style pseudo-elements: they don't describe the resting element. */
const STATEFUL = /::|:(hover|focus|focus-visible|focus-within|active|visited|target|checked)\b/;

// Longhand -> [shorthand, index among top/right/bottom/left (or row/column for gap)]
const SHORTHANDS: Partial<Record<SnapshotProperty, [string, number]>> = {
  'padding-top': ['padding', 0], 'padding-right': ['padding', 1], 'padding-bottom': ['padding', 2], 'padding-left': ['padding', 3],
  'margin-top': ['margin', 0], 'margin-right': ['margin', 1], 'margin-bottom': ['margin', 2], 'margin-left': ['margin', 3],
  'border-top-color': ['border-color', 0], 'border-right-color': ['border-color', 1], 'border-bottom-color': ['border-color', 2], 'border-left-color': ['border-color', 3],
  'row-gap': ['gap', 0], 'column-gap': ['gap', 1]
};

/** Split a value on spaces that are not inside parentheses: "var(--a) 2px" -> ["var(--a)", "2px"]. */
export function topLevelParts(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (current) parts.push(current); current = ''; } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function sideOf(parts: readonly string[], index: number, isGap: boolean): string | undefined {
  if (isGap) return parts.length === 1 ? parts[0] : parts[index];
  const map = parts.length === 1 ? [0, 0, 0, 0] : parts.length === 2 ? [0, 1, 0, 1] : parts.length === 3 ? [0, 1, 2, 1] : [0, 1, 2, 3];
  return parts[map[index]!];
}

const BORDER_STYLES = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/;
const LENGTH = /^-?\d*\.?\d+[a-z%]*$|^(thin|medium|thick)$|^calc\(/;

/** The color part of a border shorthand ("1px solid var(--line)" -> "var(--line)"). */
function borderColorPart(value: string): string | undefined {
  return topLevelParts(value).find(p => !BORDER_STYLES.test(p) && !LENGTH.test(p));
}

/** A property's declared value in one style block, from its longhand or its shorthand. */
export function declared(style: CSSStyleDeclaration, prop: string): { value: string; important: boolean } | null {
  const own = style.getPropertyValue(prop).trim();
  if (own) return { value: own, important: style.getPropertyPriority(prop) === 'important' };
  const short = SHORTHANDS[prop as SnapshotProperty];
  if (!short) return null;
  const value = style.getPropertyValue(short[0]).trim();
  if (value) {
    const side = sideOf(topLevelParts(value), short[1], short[0] === 'gap');
    return side ? { value: side, important: style.getPropertyPriority(short[0]) === 'important' } : null;
  }
  // A border color can also come from "border-top: 1px solid x" or "border: 1px solid x"
  const side = /^border-(top|right|bottom|left)-color$/.exec(prop)?.[1];
  if (side) {
    for (const shorthand of [`border-${side}`, 'border']) {
      const v = style.getPropertyValue(shorthand).trim();
      const color = v ? borderColorPart(v) : undefined;
      if (color) return { value: color, important: style.getPropertyPriority(shorthand) === 'important' };
    }
  }
  return null;
}

/** SVG shapes can be lines with no height (or width) and still paint. */
const SVG_SHAPE_TAGS = new Set(['path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);

/**
 * Text an element renders itself. A shadow host's own text only shows through a slot, styled by the
 * slot's parent inside the shadow root, so it counts there instead.
 */
function ownText(el: Element): boolean {
  const nonEmpty = (n: Node) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '';
  if (!el.shadowRoot && Array.from(el.childNodes).some(nonEmpty)) return true;
  return Array.from(el.children).some(c => c.tagName === 'SLOT' && (c as HTMLSlotElement).assignedNodes({ flatten: true }).some(nonEmpty));
}

/** Approximate selector specificity as one number (ids, then classes/attributes/pseudo-classes, then types). */
export function specificity(selector: string): number {
  const s = selector.replace(/:(not|is|has)\(([^)]*)\)/g, ' $2').replace(/:where\([^)]*\)/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g) ?? []).length;
  const types = (s.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length + (s.match(/::[\w-]+/g) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}

interface Match { style: CSSStyleDeclaration; specificity: number; order: number }

/** Every readable style rule of these sheets, with nested @media/@supports/@layer rules that apply. */
function collectRules(sheets: Iterable<CSSStyleSheet>, out: CSSStyleRule[], state: { allReadable: boolean }, win: Window): void {
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (isStyleRule(rule)) out.push(rule);
      else if (isMediaRule(rule)) { if (mediaMatches(win, rule.conditionText)) walk(rule.cssRules); }
      else if (isSupportsRule(rule)) { if (CSS.supports(rule.conditionText)) walk(rule.cssRules); }
      else if (hasRules(rule)) walk(rule.cssRules);
    }
  };
  for (const sheet of sheets) {
    if (sheet.disabled) continue;
    try { walk(sheet.cssRules); } catch { state.allReadable = false; } // a cross-origin sheet
  }
}

const sheetsOf = (root: Document | ShadowRoot): CSSStyleSheet[] => [...Array.from(root.styleSheets), ...(root.adoptedStyleSheets ?? [])];

/** Which rules match which elements in one tree (document or shadow root). */
function matchRules(root: Document | ShadowRoot, state: { allReadable: boolean; order: number }): Map<Element, Match[]> {
  const rules: CSSStyleRule[] = [];
  collectRules(sheetsOf(root), rules, state, windowOf(root));
  const map = new Map<Element, Match[]>();
  const host = isShadowRoot(root) ? root.host : null;
  for (const rule of rules) {
    const order = state.order++;
    for (const part of rule.selectorText.split(/,(?![^(]*\))/).map(p => p.trim()).filter(Boolean)) {
      if (STATEFUL.test(part)) continue;
      if (host && /^:host(\(.*\))?$/.test(part)) {
        // :host rules style the host element from inside its shadow root
        const inner = /^:host\((.*)\)$/.exec(part)?.[1];
        if (!inner || host.matches(inner)) map.set(host, [...(map.get(host) ?? []), { style: rule.style, specificity: specificity(part), order }]);
        continue;
      }
      let found: NodeListOf<Element>;
      try { found = root.querySelectorAll(part); } catch { continue; }
      for (const el of Array.from(found)) map.set(el, [...(map.get(el) ?? []), { style: rule.style, specificity: specificity(part), order }]);
    }
  }
  return map;
}

/** The winning declared value of a property for an element: inline style, then the cascade. */
function authoredValue(el: Element, prop: string, matches: readonly Match[]): string | null {
  // !important first, then inline style, then specificity, then source order
  const candidates: { value: string; important: boolean; rank: number }[] = [];
  const inline = (el as HTMLElement).style ? declared((el as HTMLElement).style, prop) : null;
  if (inline) candidates.push({ ...inline, rank: Number.MAX_SAFE_INTEGER });
  for (const m of matches) {
    const d = declared(m.style, prop);
    if (d) candidates.push({ ...d, rank: m.specificity * 1e6 + m.order });
  }
  candidates.sort((a, b) => Number(b.important) - Number(a.important) || b.rank - a.rank);
  return candidates[0]?.value ?? null;
}

const CSS_WIDE = /^(inherit|initial|unset|revert|revert-layer)$/;

/** Stylesheet rules per tree, kept for one capture so several authoredFor calls collect them once. */
export type RuleCache = Map<Node, CSSStyleRule[]>;

/**
 * What the site wrote for some properties of one element (any properties, not only the snapshot's):
 * inline style, then the stylesheet rules of its own tree that match it at rest. Used for a
 * component's images, where a few properties of a few elements are read.
 */
export function authoredFor(el: Element, props: readonly string[], cache?: RuleCache): Record<string, string> {
  const root = el.getRootNode() as Document | ShadowRoot;
  let rules = cache?.get(root);
  if (!rules) {
    rules = [];
    collectRules(sheetsOf(root), rules, { allReadable: true }, windowOf(root));
    cache?.set(root, rules);
  }
  const matches: Match[] = [];
  rules.forEach((rule, order) => {
    for (const part of rule.selectorText.split(/,(?![^(]*\))/).map(p => p.trim()).filter(Boolean)) {
      if (STATEFUL.test(part)) continue;
      let hit = false;
      try { hit = el.matches(part); } catch { /* a selector this browser can't match */ }
      if (hit) matches.push({ style: rule.style, specificity: specificity(part), order });
    }
  });
  const out: Record<string, string> = {};
  for (const p of props) {
    const value = authoredValue(el, p, matches);
    if (value && !CSS_WIDE.test(value)) out[p] = value;
  }
  return out;
}

const looksHashed = (id: string) => /\d{3,}|[a-z]+[A-Z0-9][a-zA-Z0-9]{4,}|_[a-z0-9]{5,}$/i.test(id) && /\d/.test(id);

/** A selector that finds exactly this element in its tree, from tags and positions (not hashed classes). */
export function selectorFor(el: Element, root: Document | ShadowRoot): string {
  const unique = (sel: string) => {
    try { const found = root.querySelectorAll(sel); return found.length === 1 && found[0] === el; } catch { return false; }
  };
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && !looksHashed(el.id) && unique(`#${el.id}`)) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node) {
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === node!.tagName) : [];
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    const candidate = parts.join(' > ');
    if (unique(candidate)) return candidate;
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id) && !looksHashed(node.id) && unique(`#${node.id} ${candidate}`)) return `#${node.id} ${candidate}`;
    node = parent;
  }
  return parts.join(' > ');
}

export interface SnapshotOptions {
  /** Also read inside open shadow roots (default true). */
  shadow?: boolean;
  /** Filled with the live element of each snapshot entry, by id (for the toolbar). */
  nodes?: Element[];
}

/** Read the page. Hidden elements are kept (marked not visible) so pickers can still name them. */
export function snapshotPage(doc: Document = document, options: SnapshotOptions = {}): PageSnapshot {
  const win = doc.defaultView ?? window;
  const state = { allReadable: true, order: 0 };
  const elements: ElementSnapshot[] = [];
  const rootStyle = win.getComputedStyle(doc.documentElement);
  const rootFontSize = parseFloat(rootStyle.fontSize) || 16;

  // Browser defaults for box properties, from a blank document (used when some sheets can't be read)
  const blank: { frame: HTMLIFrameElement | null } = { frame: null };
  const defaults = new Map<string, CSSStyleDeclaration>();
  const browserDefaultOf = (tag: string) => {
    if (!defaults.has(tag)) {
      if (!blank.frame) {
        blank.frame = doc.createElement('iframe');
        blank.frame.setAttribute(LUCI_UI_ATTRIBUTE, '');
        blank.frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
        doc.documentElement.appendChild(blank.frame);
      }
      const frameDoc = blank.frame.contentDocument!;
      const probe = frameDoc.createElement(tag);
      frameDoc.body.appendChild(probe);
      defaults.set(tag, frameDoc.defaultView!.getComputedStyle(probe));
    }
    return defaults.get(tag)!;
  };

  const walkTree = (root: Document | ShadowRoot, hostSelector: string | null, host: ElementSnapshot | null = null) => {
    const matches = matchRules(root, state);
    const visit = (el: Element, parent: ElementSnapshot | null, parentVisible: boolean) => {
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag) || el.hasAttribute(LUCI_UI_ATTRIBUTE)) return;
      const cs = win.getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const styles: ElementSnapshot['styles'] = {};
      for (const p of SNAPSHOT_PROPERTIES) styles[p] = cs.getPropertyValue(p).trim();
      const own = matches.get(el) ?? [];
      const authored: ElementSnapshot['authored'] = {};
      const browserDefault: NonNullable<ElementSnapshot['browserDefault']> = {};
      const declared: NonNullable<ElementSnapshot['declared']> = {};
      for (const p of SNAPSHOT_PROPERTIES) {
        let value = authoredValue(el, p, own);
        if (value) declared[p] = true;
        if (value && /^(inherit|initial|unset|revert|revert-layer)$/.test(value)) value = null;
        // An inherited value comes from the nearest ancestor that set it
        if (!value && INHERITED.has(p) && parent && parent.styles[p] === styles[p]) value = parent.authored[p] ?? null;
        if (value && value !== styles[p]) authored[p] = value;
        if (!value && BOX_PROPERTIES.includes(p) && !authoredValue(el, p, own)) {
          // No declaration: the value is the browser's, if every sheet could be read or it equals the blank-document default
          if (state.allReadable || browserDefaultOf(tag).getPropertyValue(p).trim() === styles[p]) browserDefault[p] = true;
        }
      }
      const hasBox = SVG_SHAPE_TAGS.has(tag) ? box.width > 0 || box.height > 0 : box.width > 0 && box.height > 0;
      const visible = parentVisible && cs.display !== 'none' && cs.visibility === 'visible' && Number(cs.opacity) > 0 && hasBox;
      const selector = selectorFor(el, root);
      const snapshot: ElementSnapshot = {
        id: elements.length,
        tag,
        role: el.getAttribute('role') ?? implicitRole(tag, { href: el.hasAttribute('href'), type: el.getAttribute('type') ?? undefined }),
        selector: hostSelector ? `${hostSelector} >> ${selector}` : selector,
        rect: { x: box.x + win.scrollX, y: box.y + win.scrollY, width: box.width, height: box.height },
        visible,
        hasText: ownText(el),
        inShadow: hostSelector !== null,
        ...(parent ?? host ? { parent: (parent ?? host)!.id } : {}),
        styles,
        authored,
        ...(Object.keys(browserDefault).length ? { browserDefault } : {}),
        ...(Object.keys(declared).length ? { declared } : {})
      };
      elements.push(snapshot);
      options.nodes?.push(el);
      // Children can show outside a zero-size box, and can override visibility; not past display:none or opacity 0
      const childrenCanShow = parentVisible && cs.display !== 'none' && Number(cs.opacity) > 0;
      for (const child of Array.from(el.children)) visit(child, snapshot, childrenCanShow);
      if (options.shadow !== false && el.shadowRoot) walkTree(el.shadowRoot, snapshot.selector, snapshot);
    };
    const top = isDocument(root) ? root.documentElement : null;
    if (top) visit(top, null, true);
    else for (const child of Array.from(root.children)) visit(child, null, true);
  };
  walkTree(doc, null);

  // Custom properties declared for the root element, resolved
  const names = new Set<string>();
  const rootRules: CSSStyleRule[] = [];
  collectRules(sheetsOf(doc), rootRules, { allReadable: true }, windowOf(doc));
  for (const rule of rootRules) {
    if (!rule.selectorText.split(',').some(s => { try { return doc.documentElement.matches(s.trim()); } catch { return false; } })) continue;
    for (const name of Array.from(rule.style)) if (name.startsWith('--')) names.add(name);
  }
  for (const name of Array.from(doc.documentElement.style)) if (name.startsWith('--')) names.add(name);
  const customProperties: Record<string, string> = {};
  for (const name of [...names].sort()) {
    const value = rootStyle.getPropertyValue(name).trim();
    if (value) customProperties[name] = value;
  }

  blank.frame?.remove();
  return { url: doc.location?.href ?? '', rootFontSize, customProperties, elements, stylesReadable: state.allReadable };
}
