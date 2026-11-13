/**
 * Component states (FR8): hover, focus, focus-visible, active and disabled.
 *
 * Three readers, each named in the file so a reader knows how far to trust it:
 *   forced     the extension's debugger makes the browser apply the state (CSS.forcePseudoState)
 *              and reads what it computes. Exact, on any site.
 *   rules      the stylesheet rules for the state that apply to the component. Works in any shell
 *              (readable sheets only), gives declared values.
 *   attribute  for disabled: the disabled (or aria-disabled) attribute is set for a moment.
 * A state that changes nothing readable is "not detected" (it may change through JavaScript); the
 * user can then capture it by hand (manual).
 *
 * While states are read, transitions on the targets are switched off with an inline style, so
 * values are final rather than the first frame of a transition. Everything is restored at once.
 */
import { formatRgb, parse } from 'culori';
import type { ComponentCapture } from '@luci/format/capture';
import { colorKey } from '@luci/format/capture';
import { specificity } from './dom.js';

export type StateName = ComponentCapture['states'][number]['state'];
export type ComponentState = ComponentCapture['states'][number];
export const PSEUDO_STATES = ['hover', 'focus', 'focus-visible', 'active'] as const;

/** Properties states usually change. */
export const STATE_PROPERTIES = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'box-shadow', 'outline-color', 'outline-style', 'outline-width', 'outline-offset', 'opacity', 'transform', 'filter',
  'text-decoration-line', 'cursor', 'font-weight', 'scale', 'translate'
] as const;

/** An element the state reader looks at, with the part name it has in the component. */
export interface StateTarget {
  part: string;
  el: Element;
}

export type ComputedMap = Record<string, string>;

/** Marker attribute that lets the debugger find the targets (value: the target's index). */
export const STATE_MARKER = 'data-luci-state';

export function readComputed(el: Element): ComputedMap {
  const cs = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  return Object.fromEntries(STATE_PROPERTIES.map(p => [p, cs.getPropertyValue(p).trim()]));
}

const same = (prop: string, a: string, b: string) => (/color$/.test(prop) && colorKey(a) && colorKey(b) ? colorKey(a) === colorKey(b) : a === b);

/** What a state changes on one part, as "property: before -> after". Outline and border colours are combined. */
export function diffComputed(part: string, rest: ComputedMap, now: ComputedMap, authored: Record<string, string> = {}): ComponentState['changes'] {
  // Changes nobody can see are left out: an outline that stays "none", a border side with no width
  // (their colours follow the text colour by default, so they "change" with it)
  const invisible = (p: string) => {
    if (/^outline-/.test(p) && p !== 'outline-offset') return rest['outline-style'] === 'none' && now['outline-style'] === 'none';
    const side = /^border-(\w+)-color$/.exec(p)?.[1];
    return side ? parseFloat(rest[`border-${side}-width`] ?? '0') === 0 && parseFloat(now[`border-${side}-width`] ?? '0') === 0 : false;
  };
  const changed = STATE_PROPERTIES.filter(p => now[p] !== undefined && !same(p, rest[p] ?? '', now[p] ?? '') && !invisible(p));
  const out: ComponentState['changes'] = [];
  const outline = ['outline-color', 'outline-style', 'outline-width'];
  const borders = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
  const done = new Set<string>();
  const label = part === 'container' ? {} : { part };
  if (outline.some(p => changed.includes(p as (typeof STATE_PROPERTIES)[number]))) {
    out.push({ ...label, property: 'outline', from: outline.map(p => rest[p]).join(' '), to: { computed: outline.map(p => now[p]).join(' ') } });
    outline.forEach(p => done.add(p));
  }
  if (borders.every(p => changed.includes(p as (typeof STATE_PROPERTIES)[number])) && new Set(borders.map(p => now[p])).size === 1) {
    out.push({ ...label, property: 'border-color', from: rest['border-top-color'] ?? '', to: { computed: now['border-top-color'] ?? '' } });
    borders.forEach(p => done.add(p));
  }
  for (const p of changed) {
    if (done.has(p)) continue;
    const a = authored[p];
    out.push({ ...label, property: p, from: rest[p] ?? '', to: { computed: now[p] ?? '', ...(a && a !== now[p] ? { authored: a } : {}), ...(a && /^var\(\s*(--[\w-]+)\s*\)$/.test(a) ? { token: /^var\(\s*(--[\w-]+)/.exec(a)![1]! } : {}) } });
  }
  return out;
}

/**
 * Get the targets ready: mark them for the debugger and switch their transitions and animations
 * off. Returns the function that puts everything back exactly as it was.
 */
export function prepareTargets(targets: readonly StateTarget[]): () => void {
  const saved = targets.map(t => ({ el: t.el, style: t.el.getAttribute('style'), marker: t.el.getAttribute(STATE_MARKER) }));
  targets.forEach((t, i) => {
    t.el.setAttribute(STATE_MARKER, String(i));
    const style = (t.el as HTMLElement).style;
    if (style) {
      style.setProperty('transition', 'none', 'important');
      style.setProperty('animation', 'none', 'important');
      // Chrome writes CSSOM changes to the style attribute lazily; read it once so a later removal sticks
      t.el.getAttribute('style');
    }
  });
  return () => {
    for (const s of saved) {
      const style = (s.el as HTMLElement).style;
      if (style) style.cssText = s.style ?? '';
      if (s.style === null) s.el.removeAttribute('style'); else s.el.setAttribute('style', s.style);
      if (s.marker === null) s.el.removeAttribute(STATE_MARKER); else s.el.setAttribute(STATE_MARKER, s.marker);
    }
  };
}

const STATE_PSEUDO = /:(hover|focus-visible|focus|active)(?![\w-])/g;

/** Every style rule of a tree's readable sheets (nested @media/@supports that apply included). */
function rulesOf(root: Document | ShadowRoot): CSSStyleRule[] {
  const out: CSSStyleRule[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) out.push(r);
      else if (r instanceof CSSMediaRule) { if (matchMedia(r.conditionText).matches) walk(r.cssRules); }
      else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of [...Array.from(root.styleSheets), ...(root.adoptedStyleSheets ?? [])]) {
    try { walk(sheet.cssRules); } catch { /* a cross-origin sheet */ }
  }
  return out;
}

const matches = (el: Element, selector: string) => { try { return selector.trim() === '' ? false : el.matches(selector); } catch { return false; } };

/**
 * The states that stylesheet rules give the component: rules with :hover, :focus, :focus-visible
 * or :active on the container (or on an ancestor compound that is the container), applying to a target.
 */
export function readStatesFromRules(targets: readonly StateTarget[]): ComponentState[] {
  const container = targets[0]!.el;
  const roots = new Set(targets.map(t => t.el.getRootNode() as Document | ShadowRoot));
  const rest = targets.map(t => readComputed(t.el));
  // Per state and target: the winning declared value of each property (by specificity)
  const found = new Map<StateName, Map<number, Map<string, { value: string; authored: string; spec: number }>>>();
  for (const root of roots) {
    for (const rule of rulesOf(root)) {
      for (const part of rule.selectorText.split(/,(?![^(]*\))/)) {
        const states = [...part.matchAll(STATE_PSEUDO)].map(m => m[1] as StateName);
        if (states.length !== 1 || /:focus-within|::/.test(part)) continue;
        const state = states[0]!;
        const stripped = part.replace(STATE_PSEUDO, '').trim();
        const base = stripped === '' || /[\s>+~]$/.test(stripped) ? `${stripped}*` : stripped;
        // The state must sit on the compound that is the container
        // ":focus-visible" alone, or "nav :hover", means any element there: like CSS, read it as "*"
        const before = part.slice(0, part.search(STATE_PSEUDO)).replace(STATE_PSEUDO, '');
        const upToState = before.trim() === '' || /[\s>+~]$/.test(before) ? `${before}*` : before;
        const hostLike = /^:host\(?/.test(part);
        if (!hostLike && !matches(container, upToState)) continue;
        targets.forEach((t, i) => {
          if (!hostLike && !matches(t.el, base)) return;
          if (hostLike && i !== 0) return;
          const byTarget = found.get(state) ?? new Map<number, Map<string, { value: string; authored: string; spec: number }>>();
          const props = byTarget.get(i) ?? new Map<string, { value: string; authored: string; spec: number }>();
          const spec = specificity(part);
          for (const prop of STATE_PROPERTIES) {
            const authored = rule.style.getPropertyValue(prop).trim() || shorthandFor(rule.style, prop);
            if (!authored) continue;
            if ((props.get(prop)?.spec ?? -1) > spec) continue;
            props.set(prop, { value: browserForm(prop, resolveVar(t.el, authored)), authored, spec });
          }
          byTarget.set(i, props);
          found.set(state, byTarget);
        });
      }
    }
  }
  // The same diff as for forced states, so both readers describe changes alike
  return PSEUDO_STATES.map(state => {
    const byTarget = found.get(state);
    const changes = byTarget ? targets.flatMap((t, i) => {
      const props = byTarget.get(i);
      if (!props) return [];
      const now = { ...rest[i]!, ...Object.fromEntries([...props].map(([p, v]) => [p, v.value])) };
      return diffComputed(t.part, rest[i]!, now, Object.fromEntries([...props].map(([p, v]) => [p, v.authored])));
    }) : [];
    return changes.length ? { state, detected: true, method: 'rules' as const, changes } : { state, detected: false, changes: [] };
  });
}

/** Colours in the browser's own form ("rgb(3, 83, 233)"), so rule values compare and read like computed ones. */
function browserForm(prop: string, value: string): string {
  if (!/color$/.test(prop)) return value;
  const c = parse(value);
  return c ? formatRgb(c) : value;
}

function shorthandFor(style: CSSStyleDeclaration, prop: string): string {
  if (prop === 'background-color') return style.getPropertyValue('background').trim().match(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|\b[a-z]+\b)$/i)?.[0] ?? '';
  if (/^border-\w+-color$/.test(prop)) return style.getPropertyValue('border-color').trim().split(/\s+(?![^(]*\))/)[0] ?? '';
  if (/^outline-(color|style|width)$/.test(prop)) {
    const v = style.getPropertyValue('outline').trim();
    if (!v) return '';
    const parts = v.split(/\s+(?![^(]*\))/);
    const width = parts.find(p => /^\d|^(thin|medium|thick)$/.test(p));
    const st = parts.find(p => /^(none|solid|dashed|dotted|double|auto|groove|ridge|inset|outset)$/.test(p));
    const color = parts.find(p => p !== width && p !== st);
    return (prop === 'outline-width' ? width : prop === 'outline-style' ? st : color) ?? '';
  }
  return '';
}

/** A declared value with var() resolved on the element (best effort): "var(--x)" -> its value. */
function resolveVar(el: Element, value: string): string {
  const cs = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_m, name: string, fallback?: string) => cs.getPropertyValue(name).trim() || (fallback ?? '').trim());
}

/** Disabled (FR8): set disabled (form controls and buttons) or aria-disabled for a moment and read. */
export function readDisabled(targets: readonly StateTarget[]): ComponentState | null {
  const container = targets[0]!.el;
  const native = /^(BUTTON|INPUT|SELECT|TEXTAREA|FIELDSET|OPTGROUP|OPTION)$/.test(container.tagName);
  const attr = native ? 'disabled' : 'aria-disabled';
  if (container.hasAttribute('disabled') || container.getAttribute('aria-disabled') === 'true') return null;
  const rest = targets.map(t => readComputed(t.el));
  container.setAttribute(attr, native ? '' : 'true');
  let now: ComputedMap[];
  try {
    now = targets.map(t => readComputed(t.el));
  } finally {
    container.removeAttribute(attr);
  }
  const changes = targets.flatMap((t, i) => diffComputed(t.part, rest[i]!, now[i]!));
  return changes.length ? { state: 'disabled', detected: true, method: 'attribute', changes } : { state: 'disabled', detected: false, changes: [] };
}

/** Computed values per state per target, as the debugger reads them (see readStatesViaCdp). */
export type ForcedReading = { rest: ComputedMap[]; states: Partial<Record<StateName, ComputedMap[]>> };

/** Turn a debugger reading into states. A state with no change is "not detected". */
export function statesFromForced(targets: readonly StateTarget[], reading: ForcedReading): ComponentState[] {
  return PSEUDO_STATES.map(state => {
    const now = reading.states[state];
    if (!now) return { state, detected: false, changes: [] };
    const changes = targets.flatMap((t, i) => diffComputed(t.part, reading.rest[i] ?? {}, now[i] ?? {}));
    return changes.length ? { state, detected: true, method: 'forced' as const, changes } : { state, detected: false, changes: [] };
  });
}

/** A state captured by hand: the values now, against the resting values read before. */
export function manualState(state: StateName, targets: readonly StateTarget[], rest: readonly ComputedMap[]): ComponentState {
  const changes = targets.flatMap((t, i) => diffComputed(t.part, rest[i] ?? {}, readComputed(t.el)));
  return changes.length ? { state, detected: true, method: 'manual', changes } : { state, detected: false, changes: [] };
}

/** A debugger command: chrome.debugger.sendCommand in the extension, a CDP session in tests. */
export type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

interface CdpNode { nodeId: number; attributes?: string[]; children?: CdpNode[]; shadowRoots?: CdpNode[]; contentDocument?: CdpNode }

/**
 * Read the marked targets in each pseudo-state through the debugger (Chrome DevTools Protocol):
 * force the state on the container, read every target's computed style, then reset.
 * The caller prepares the targets first (prepareTargets) and restores them after.
 */
export async function readStatesViaCdp(send: CdpSend, count: number): Promise<ForcedReading> {
  await send('DOM.enable');
  await send('CSS.enable');
  const { root } = (await send('DOM.getDocument', { depth: -1, pierce: true })) as { root: CdpNode };
  const ids = new Map<number, number>();
  const walk = (node: CdpNode) => {
    const attrs = node.attributes ?? [];
    for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === STATE_MARKER) ids.set(Number(attrs[i + 1]), node.nodeId);
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child);
  };
  walk(root);
  const nodes = Array.from({ length: count }, (_, i) => ids.get(i));
  if (nodes.some(n => n === undefined)) throw new Error('The debugger could not find the picked element.');
  const read = async () => Promise.all(nodes.map(async nodeId => {
    const { computedStyle } = (await send('CSS.getComputedStyleForNode', { nodeId })) as { computedStyle: { name: string; value: string }[] };
    const all = new Map(computedStyle.map(c => [c.name, c.value]));
    return Object.fromEntries(STATE_PROPERTIES.map(p => [p, all.get(p) ?? '']));
  }));
  const reading: ForcedReading = { rest: await read(), states: {} };
  try {
    for (const state of PSEUDO_STATES) {
      await send('CSS.forcePseudoState', { nodeId: nodes[0], forcedPseudoClasses: [state] });
      reading.states[state] = await read();
    }
  } finally {
    await send('CSS.forcePseudoState', { nodeId: nodes[0], forcedPseudoClasses: [] });
  }
  return reading;
}
