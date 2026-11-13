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
import { formatRgb } from 'culori';
import type { ComponentCapture } from '@luci/format/capture';
import { colorKey, parseColor } from '@luci/format/capture';
import { selectorFor, specificity } from './dom.js';
import { elementName, implicitRole } from './naming.js';

export type StateName = ComponentCapture['states'][number]['state'];
export type ComponentState = ComponentCapture['states'][number];
export const PSEUDO_STATES = ['hover', 'focus', 'focus-visible', 'active'] as const;

/** Properties states usually change. */
export const STATE_PROPERTIES = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'box-shadow', 'outline-color', 'outline-style', 'outline-width', 'outline-offset', 'opacity', 'transform', 'filter',
  'text-decoration-line', 'cursor', 'font-weight', 'scale', 'translate',
  // Elements that appear, grow or are revealed in a state (a menu, an underline bar, a clipped image)
  'visibility', 'display', 'width', 'height', 'clip-path'
] as const;

/** An element the state reader looks at, with the part name it has in the component. */
export interface StateTarget {
  part: string;
  el: Element;
}

export type ComputedMap = Record<string, string>;

/** Marker attribute that lets the debugger find the targets (value: the target's index). */
export const STATE_MARKER = 'data-luci-state';
/** Marker on the elements around the component (value: how many levels up), for hovering like a real pointer. */
export const STATE_UP_MARKER = 'data-luci-state-up';
/** Hover is put on at most this many levels around the component (group-hover triggers are close by). */
export const STATE_UP_LEVELS = 12;

/** The elements around an element, nearest first, up to <html>, through shadow hosts. */
export function ancestorsOf(el: Element): Element[] {
  const out: Element[] = [];
  for (let n: Element | null = el.parentElement ?? ((el.getRootNode() as ShadowRoot).host ?? null); n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) out.push(n);
  return out;
}

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
/** At most this many levels up, the element that takes focus for a component that cannot (a card inside a link). */
export const FOCUS_UP = 4;

/** 0 when the element itself takes focus, else how many levels up the element that does is (0 when none is near). */
export function focusDepthOf(el: Element): number {
  if (el.matches(FOCUSABLE)) return 0;
  const up = ancestorsOf(el).slice(0, FOCUS_UP).findIndex(a => a.matches(FOCUSABLE));
  return up === -1 ? 0 : up + 1;
}

/** The element `depth` levels around the component, as a state's trigger: its name and a selector for it. */
export function triggerOf(container: Element, depth: number): ComponentState['trigger'] {
  const el = ancestorsOf(container)[depth - 1];
  if (!el) return undefined;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') ?? implicitRole(tag, { href: el.hasAttribute('href'), type: el.getAttribute('type') ?? undefined });
  return { element: elementName(tag, role), selector: selectorFor(el, el.getRootNode() as Document | ShadowRoot), depth };
}

export function readComputed(el: Element): ComputedMap {
  const cs = (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
  return Object.fromEntries(STATE_PROPERTIES.map(p => [p, cs.getPropertyValue(p).trim()]));
}

const same = (prop: string, a: string, b: string) => (/color$/.test(prop) && colorKey(a) && colorKey(b) ? colorKey(a) === colorKey(b) : a === b);

/** What a state changes on one part, as "property: before -> after". Outline and border colors are combined. */
export function diffComputed(part: string, rest: ComputedMap, now: ComputedMap, authored: Record<string, string> = {}): ComponentState['changes'] {
  // Changes nobody can see are left out: an outline that stays "none", a border side with no width
  // (their colors follow the text color by default, so they "change" with it)
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
  const ups = targets[0] ? ancestorsOf(targets[0].el).slice(0, STATE_UP_LEVELS) : [];
  const savedUp = ups.map(el => ({ el, marker: el.getAttribute(STATE_UP_MARKER) }));
  ups.forEach((el, i) => el.setAttribute(STATE_UP_MARKER, String(i + 1)));
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
    for (const s of savedUp) {
      if (s.marker === null) s.el.removeAttribute(STATE_UP_MARKER); else s.el.setAttribute(STATE_UP_MARKER, s.marker);
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
  // A pointer on the component hovers (and presses) every element around it too: ".group:hover .card"
  // applies. Focus goes to the component, or to the element around it that takes focus (a card in a link).
  const ups = ancestorsOf(container);
  const focusDepth = focusDepthOf(container);
  // Per state: how many levels up the elements whose state the applying rules need are (0: the component)
  const depths = new Map<StateName, Set<number>>();
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
        let depth = 0;
        if (!hostLike && !matches(container, upToState)) {
          const isFocus = state === 'focus' || state === 'focus-visible';
          const up = ups.findIndex((a, i) => (!isFocus || i + 1 === focusDepth) && matches(a, upToState));
          if (up === -1) continue;
          depth = up + 1;
        }
        let applied = false;
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
            applied = true;
          }
          byTarget.set(i, props);
          found.set(state, byTarget);
        });
        if (applied) depths.set(state, new Set([...(depths.get(state) ?? []), depth]));
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
    if (!changes.length) return { state, detected: false, method: 'rules' as const, changes: [] };
    // Triggered from around it only when no rule on the component itself applies
    const ds = depths.get(state) ?? new Set([0]);
    const trigger = ds.has(0) ? undefined : triggerOf(container, Math.min(...ds));
    return { state, detected: true, method: 'rules' as const, changes, ...(trigger ? { trigger } : {}) };
  });
}

/** Colors in the browser's own form ("rgb(3, 83, 233)"), so rule values compare and read like computed ones. */
function browserForm(prop: string, value: string): string {
  if (!/color$/.test(prop)) return value;
  const c = parseColor(value);
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
  return { state: 'disabled', detected: changes.length > 0, method: 'attribute', changes };
}

/**
 * Computed values per state per target, as the debugger reads them (see readStatesViaCdp).
 * `triggers`: for a state that comes from an element around the component, how many levels up it is.
 * `pointer`: the values with a real pointer on the component, read when forcing :hover changed nothing.
 */
export type ForcedReading = {
  rest: ComputedMap[];
  states: Partial<Record<StateName, ComputedMap[]>>;
  triggers?: Partial<Record<StateName, number>>;
  pointer?: ComputedMap[];
};

/** Turn a debugger reading into states. A state the debugger forced that changes nothing is "no change". */
export function statesFromForced(targets: readonly StateTarget[], reading: ForcedReading): ComponentState[] {
  const container = targets[0]!.el;
  const diff = (now: ComputedMap[]) => targets.flatMap((t, i) => diffComputed(t.part, reading.rest[i] ?? {}, now[i] ?? {}));
  return PSEUDO_STATES.map(state => {
    const now = reading.states[state];
    if (!now) return { state, detected: false, changes: [] };
    const changes = diff(now);
    if (changes.length) {
      const depth = reading.triggers?.[state];
      const trigger = depth ? triggerOf(container, depth) : undefined;
      return { state, detected: true, method: 'forced' as const, changes, ...(trigger ? { trigger } : {}) };
    }
    // Forcing :hover runs no JavaScript; a real pointer does (Framer Motion, GSAP, Webflow interactions)
    if (state === 'hover' && reading.pointer) {
      const moved = diff(reading.pointer);
      return moved.length ? { state, detected: true, method: 'pointer' as const, changes: moved } : { state, detected: false, method: 'pointer' as const, changes: [] };
    }
    return { state, detected: false, method: 'forced' as const, changes: [] };
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

/** What the page tells the debugger reader besides the target count. */
export interface CdpReadOptions {
  /** How many levels up the element that takes focus is (0: the component itself); see focusDepthOf. */
  focusDepth?: number;
  /** A point on the component (viewport px) for a real pointer when forcing :hover finds nothing. */
  hoverPoint?: { x: number; y: number };
  /** Where the pointer goes afterwards (where the user's pointer is: on Luci's panel). */
  awayPoint?: { x: number; y: number };
}

/** A real pointer's hover can animate (JavaScript tweens): wait until values hold still, within these limits. */
export const POINTER_SETTLE_MS = 300;
export const POINTER_MAX_MS = 1500;
/** No change at all this long after the pointer arrives: the component has no hover. */
export const POINTER_NOTHING_MS = 500;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Read the marked targets in each pseudo-state through the debugger (Chrome DevTools Protocol), the
 * way a real pointer would set them: hover and active on the component AND every element around it
 * (so ".group:hover .card" applies), then on the component alone and one more level up at a time, to
 * name the element that triggers it; focus on the element that takes focus, with :focus-within above.
 * When forcing :hover changes nothing and the page gave a point, a real pointer is moved onto the
 * component so the site's JavaScript runs too. The caller prepares the targets first (prepareTargets)
 * and restores them after.
 */
export async function readStatesViaCdp(send: CdpSend, count: number, options: CdpReadOptions = {}): Promise<ForcedReading> {
  await send('DOM.enable');
  await send('CSS.enable');
  const ids = new Map<number, number>();
  const upIds = new Map<number, number>();
  // Fast: find the marked elements by selector (the whole tree of a big page is slow to send)...
  const { root: doc } = (await send('DOM.getDocument', { depth: 0 })) as { root: CdpNode };
  const find = async (selector: string) => ((await send('DOM.querySelector', { nodeId: doc.nodeId, selector })) as { nodeId: number }).nodeId;
  const found = await Promise.all([
    ...Array.from({ length: count }, (_, i) => find(`[${STATE_MARKER}="${i}"]`).then(n => { if (n) ids.set(i, n); })),
    ...Array.from({ length: STATE_UP_LEVELS }, (_, i) => find(`[${STATE_UP_MARKER}="${i + 1}"]`).then(n => { if (n) upIds.set(i + 1, n); }))
  ]).then(() => ids.size === count);
  // ...and only inside shadow roots (selectors do not reach in) walk the whole tree
  if (!found) {
    ids.clear();
    upIds.clear();
    const { root } = (await send('DOM.getDocument', { depth: -1, pierce: true })) as { root: CdpNode };
    const walk = (node: CdpNode) => {
      const attrs = node.attributes ?? [];
      for (let i = 0; i < attrs.length; i += 2) {
        if (attrs[i] === STATE_MARKER) ids.set(Number(attrs[i + 1]), node.nodeId);
        if (attrs[i] === STATE_UP_MARKER) upIds.set(Number(attrs[i + 1]), node.nodeId);
      }
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) walk(child);
    };
    walk(root);
  }
  const nodes = Array.from({ length: count }, (_, i) => ids.get(i));
  if (nodes.some(n => n === undefined)) throw new Error('The debugger could not find the picked element.');
  const container = nodes[0]!;
  // Nearest first; stops at the first level the page did not mark
  const ups: number[] = [];
  for (let d = 1; upIds.has(d); d++) ups.push(upIds.get(d)!);

  const readOne = async (nodeId: number): Promise<ComputedMap> => {
    const { computedStyle } = (await send('CSS.getComputedStyleForNode', { nodeId })) as { computedStyle: { name: string; value: string }[] };
    const all = new Map(computedStyle.map(c => [c.name, c.value]));
    return Object.fromEntries(STATE_PROPERTIES.map(p => [p, all.get(p) ?? '']));
  };
  /** Every target, or only those at `only` (the others come back empty). */
  const read = async (only?: readonly number[]) => Promise.all(nodes.map(async (nodeId, i) => (only && !only.includes(i) ? {} : readOne(nodeId!))));
  const same = (a: ComputedMap | undefined, b: ComputedMap | undefined) => STATE_PROPERTIES.every(p => (a?.[p] ?? '') === (b?.[p] ?? ''));
  const force = async (list: readonly number[], classes: string[]) => {
    await Promise.all(list.map(nodeId => send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes })));
  };

  const reading: ForcedReading = { rest: await read(), states: {}, triggers: {} };
  const changedIn = (now: ComputedMap[]) => now.map((m, i) => (same(m, reading.rest[i]) ? -1 : i)).filter(i => i >= 0);
  const chain = [container, ...ups];
  try {
    for (const state of PSEUDO_STATES) {
      if (state === 'hover' || state === 'active') {
        await force(chain, [state]);
        const all = await read();
        reading.states[state] = all;
        const changed = changedIn(all);
        if (changed.length && ups.length) {
          // The component alone first, then one more level up at a time, until the result matches
          await force(ups, []);
          let depth = 0;
          let now = await read(changed);
          while (!changed.every(i => same(now[i], all[i])) && depth < ups.length) {
            await force([ups[depth]!], [state]);
            depth++;
            now = await read(changed);
          }
          if (depth > 0) reading.triggers![state] = depth;
        }
        await force(chain, []);
      } else {
        const depth = Math.min(Math.max(0, options.focusDepth ?? 0), ups.length);
        const target = depth === 0 ? container : ups[depth - 1]!;
        const above = ups.slice(depth);
        await force([target], [state, 'focus-within']);
        await force(above, ['focus-within']);
        const all = await read();
        reading.states[state] = all;
        if (depth > 0 && changedIn(all).length) reading.triggers![state] = depth;
        await force([target, ...above], []);
      }
    }
    if (options.hoverPoint && !changedIn(reading.states.hover ?? reading.rest).length) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: options.hoverPoint.x, y: options.hoverPoint.y });
      const start = Date.now();
      let previous = await read();
      for (;;) {
        await sleep(100);
        const now = await read();
        const still = now.every((m, i) => same(m, previous[i]));
        previous = now;
        const waited = Date.now() - start;
        const nothing = !changedIn(now).length;
        if ((still && !nothing && waited >= POINTER_SETTLE_MS) || (nothing && waited >= POINTER_NOTHING_MS) || waited >= POINTER_MAX_MS) break;
      }
      reading.pointer = previous;
      const away = options.awayPoint ?? { x: 0, y: 0 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: away.x, y: away.y });
    }
  } finally {
    await force(chain, []).catch(() => undefined);
  }
  return reading;
}
