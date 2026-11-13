/**
 * What each toolbar tool produces from a pick. The view (toolbar.tsx) calls these; they hold no UI state.
 * Every tool offers two outputs (FR5): this one item, or the whole system on the page.
 */
import { captureFileName, formatCapture, type Capture, type CaptureSettings, type ComponentCapture } from '@luci/format/capture';
import { colorToken, colorUses, colorSystem } from '../color.js';
import { componentCapture, componentParts, componentType } from '../component.js';
import { prepareTargets, readComputed, readDisabled, readStatesFromRules, statesFromForced, type ComputedMap, type ForcedReading, type StateTarget } from '../states.js';
import { snapshotPage } from '../dom.js';
import type { ElementSnapshot, PageSnapshot } from '../model.js';
import { pageCapture, pageComponents } from '../page.js';
import { distanceToken, spacingSet, spacingSystem, spacingToken, spacingUses, type SpacingUse } from '../spacing.js';
import { textToken, typographySystem } from '../text.js';

export const TOOLS = ['component', 'text', 'color', 'spacing'] as const;
export type ToolId = (typeof TOOLS)[number];
export const TOOL_LABELS: Readonly<Record<ToolId, string>> = { component: 'Component', text: 'Text', color: 'Color', spacing: 'Spacing' };

export interface Output {
  capture: Capture;
  fileName: string;
  markdown: string;
}

export type Result = { ok: true; output: Output } | { ok: false; message: string };

export const toOutput = (capture: Capture, settings: CaptureSettings): Output => ({
  capture,
  fileName: captureFileName(capture.meta),
  markdown: formatCapture(capture, settings)
});

/** A snapshot of the page plus the live element behind each entry. */
export interface LiveSnapshot {
  snapshot: PageSnapshot;
  nodes: Element[];
  /** The snapshot entry for a live element. */
  entryFor(el: Element): ElementSnapshot | null;
}

export function liveSnapshot(doc: Document = document): LiveSnapshot {
  const nodes: Element[] = [];
  const snapshot = snapshotPage(doc, { nodes });
  const index = new Map(nodes.map((n, i) => [n, i]));
  return { snapshot, nodes, entryFor: el => snapshot.elements[index.get(el) ?? -1] ?? null };
}

/** The element whose text a Text pick means: the element itself, or the first text inside it. */
export function textTarget(live: LiveSnapshot, entry: ElementSnapshot): ElementSnapshot | null {
  if (entry.hasText && entry.visible) return entry;
  const node = live.nodes[entry.id]!;
  return live.snapshot.elements.find(e => e.id > entry.id && e.hasText && e.visible && node.contains(live.nodes[e.id]!)) ?? null;
}

/** Spacing values one element sets, for the Spacing tool to offer. */
export const spacingChoices = (entry: ElementSnapshot): SpacingUse[] => spacingUses(entry);
/** The Spacing choice that takes every value of the element (the default). */
export const ALL_SPACING = -1;

const CAPTURED = () => new Date().toISOString().slice(0, 10);

/** How deep an element is inside a container (0 for the container itself, null outside it). */
export function insideOf(live: LiveSnapshot, container: ElementSnapshot): (el: ElementSnapshot) => number | null {
  const root = live.nodes[container.id]!;
  return (el) => {
    let depth = 0;
    for (let n: Element | null = live.nodes[el.id] ?? null; n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) {
      if (n === root) return depth;
      depth++;
    }
    return null;
  };
}

/** A component capture from a pick; `system` adds the page's variants. States are read separately (states.ts). */
export function captureComponent(live: LiveSnapshot, entry: ElementSnapshot, settings: CaptureSettings, options: { system?: boolean; states?: ComponentCapture['states'] } = {}): Result {
  return { ok: true, output: toOutput(componentCapture(live.snapshot, entry, insideOf(live, entry), { captured: CAPTURED(), ...options }), settings) };
}

/** Reads states through the debugger; the extension provides it (it sends the commands from its background). */
export type ForcedStatesReader = (targetCount: number) => Promise<ForcedReading>;

/** The elements a component's states are read on: the container and its parts. */
export function stateTargets(live: LiveSnapshot, entry: ElementSnapshot): StateTarget[] {
  return componentParts(live.snapshot, entry, insideOf(live, entry)).map(p => ({ part: p.part, el: live.nodes[p.el.id]! }));
}

/** The resting values of the targets, for comparing a state captured by hand later. */
export const restingValues = (targets: readonly StateTarget[]): ComputedMap[] => targets.map(t => readComputed(t.el));

/**
 * A component's states (FR8): through the debugger when the shell has it (exact), otherwise from
 * stylesheet rules; disabled for buttons and fields by setting the attribute for a moment. The page
 * is left exactly as it was.
 */
export async function readComponentStates(live: LiveSnapshot, entry: ElementSnapshot, readForced?: ForcedStatesReader): Promise<{ states: ComponentCapture['states']; note: string | null }> {
  const targets = stateTargets(live, entry);
  const restore = prepareTargets(targets);
  try {
    let pseudo: ComponentCapture['states'];
    let note: string | null = null;
    if (readForced) {
      try {
        pseudo = statesFromForced(targets, await readForced(targets.length));
      } catch (err) {
        pseudo = readStatesFromRules(targets);
        note = `The browser's debugger was not available (${err instanceof Error ? err.message : String(err)}), so states were read from stylesheet rules.`;
      }
    } else {
      pseudo = readStatesFromRules(targets);
    }
    const disabled = ['button', 'field'].includes(componentType(entry)) ? readDisabled(targets) : null;
    return { states: [...pseudo, ...(disabled ? [disabled] : [])], note };
  } finally {
    restore();
  }
}

/** "This one": one item from the picked element. */
export function captureOne(tool: ToolId, live: LiveSnapshot, entry: ElementSnapshot, settings: CaptureSettings, choice = ALL_SPACING): Result {
  const options = { captured: CAPTURED() };
  if (tool === 'component') return captureComponent(live, entry, settings);
  if (tool === 'text') {
    const target = textTarget(live, entry);
    if (!target) return { ok: false, message: 'This element has no text. Pick a heading, paragraph, link or label.' };
    return { ok: true, output: toOutput(textToken(live.snapshot, target, options), settings) };
  }
  if (tool === 'color') {
    if (!colorUses(entry).length) return { ok: false, message: 'This element applies no color of its own. Pick another, or use "Pick a pixel".' };
    const token = colorToken(live.snapshot, { element: entry }, options);
    return token ? { ok: true, output: toOutput(token, settings) } : { ok: false, message: 'No color found here.' };
  }
  const uses = spacingChoices(entry);
  const none: Result = { ok: false, message: 'This element sets no padding, margin or gap. Pick another, or drag between two elements to measure.' };
  // ALL_SPACING (the default): every value in one file; one value alone stays a single token
  if (choice === ALL_SPACING && uses.length > 1) {
    const set = spacingSet(live.snapshot, entry, options);
    return set ? { ok: true, output: toOutput(set, settings) } : none;
  }
  const use = uses[Math.max(0, choice)];
  if (!use) return none;
  return { ok: true, output: toOutput(spacingToken(live.snapshot, use, options), settings) };
}

/**
 * The states of one component of a page file: from stylesheet rules, plus disabled for buttons and
 * fields. Only the states found: a page file has no "capture by hand", so "not detected" is noise there.
 */
function ruleStates(live: LiveSnapshot, entry: ElementSnapshot): ComponentCapture['states'] {
  const targets = stateTargets(live, entry);
  const restore = prepareTargets(targets);
  try {
    const disabled = ['button', 'field'].includes(componentType(entry)) ? readDisabled(targets) : null;
    return [...readStatesFromRules(targets), ...(disabled ? [disabled] : [])].filter(s => s.detected);
  } finally {
    restore();
  }
}

/** "Whole page": one file with the page's systems and every kind of component on it. */
export function capturePage(live: LiveSnapshot, settings: CaptureSettings, options: { captured?: string } = {}): Result {
  const components = pageComponents(live.snapshot).map(entry => ({ entry, inside: insideOf(live, entry), states: ruleStates(live, entry) }));
  const page = pageCapture(live.snapshot, components, { captured: options.captured ?? CAPTURED() });
  if (!page.typography && !page.color && !page.spacing && !page.components.length) return { ok: false, message: 'This page has nothing visible to capture.' };
  return { ok: true, output: toOutput(page, settings) };
}

/** The color of a pixel from the eyedropper. */
export function capturePixel(live: LiveSnapshot, hex: string, settings: CaptureSettings): Result {
  const token = colorToken(live.snapshot, { pixel: hex }, { captured: CAPTURED() });
  return token ? { ok: true, output: toOutput(token, settings) } : { ok: false, message: `Not a color: ${hex}` };
}

/** The distance between two elements (a Spacing drag). */
export function captureDistance(live: LiveSnapshot, a: ElementSnapshot, b: ElementSnapshot, settings: CaptureSettings): Result {
  return { ok: true, output: toOutput(distanceToken(live.snapshot, a, b, { captured: CAPTURED() }), settings) };
}

/** "The whole system": the page's typography, colors or spacing; for a component, its variants on the page. */
export function captureSystem(tool: ToolId, live: LiveSnapshot, settings: CaptureSettings, entry?: ElementSnapshot): Result {
  const options = { captured: CAPTURED() };
  if (tool === 'component') {
    if (!entry || entry.tag === 'body' || entry.tag === 'html') return { ok: false, message: 'Pick a component first (a button, card, link...), then "The whole system" lists its variants on this page.' };
    return captureComponent(live, entry, settings, { system: true });
  }
  const system = tool === 'text' ? typographySystem(live.snapshot, options) : tool === 'color' ? colorSystem(live.snapshot, options) : spacingSystem(live.snapshot, options);
  if (!system) return { ok: false, message: `This page has no ${tool === 'text' ? 'visible text' : tool === 'color' ? 'visible colors' : 'spacing'} to capture.` };
  return { ok: true, output: toOutput(system, settings) };
}
