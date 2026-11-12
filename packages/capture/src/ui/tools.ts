/**
 * What each toolbar tool produces from a pick. The view (toolbar.tsx) calls these; they hold no UI state.
 * Every tool offers two outputs (FR5): this one item, or the whole system on the page.
 */
import { captureFileName, formatCapture, type Capture, type CaptureSettings } from '@luci/format/capture';
import { colorToken, colorUses, colorSystem } from '../color.js';
import { snapshotPage } from '../dom.js';
import type { ElementSnapshot, PageSnapshot } from '../model.js';
import { distanceToken, spacingSystem, spacingToken, spacingUses, type SpacingUse } from '../spacing.js';
import { textToken, typographySystem } from '../text.js';

export const TOOLS = ['text', 'color', 'spacing'] as const;
export type ToolId = (typeof TOOLS)[number];
export const TOOL_LABELS: Readonly<Record<ToolId, string>> = { text: 'Text', color: 'Colour', spacing: 'Spacing' };

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

const CAPTURED = () => new Date().toISOString().slice(0, 10);

/** "This one": one item from the picked element. */
export function captureOne(tool: ToolId, live: LiveSnapshot, entry: ElementSnapshot, settings: CaptureSettings, choice = 0): Result {
  const options = { captured: CAPTURED() };
  if (tool === 'text') {
    const target = textTarget(live, entry);
    if (!target) return { ok: false, message: 'This element has no text. Pick a heading, paragraph, link or label.' };
    return { ok: true, output: toOutput(textToken(live.snapshot, target, options), settings) };
  }
  if (tool === 'color') {
    if (!colorUses(entry).length) return { ok: false, message: 'This element applies no colour of its own. Pick another, or use "Pick a pixel".' };
    const token = colorToken(live.snapshot, { element: entry }, options);
    return token ? { ok: true, output: toOutput(token, settings) } : { ok: false, message: 'No colour found here.' };
  }
  const uses = spacingChoices(entry);
  const use = uses[choice];
  if (!use) return { ok: false, message: 'This element sets no padding, margin or gap. Pick another, or drag between two elements to measure.' };
  return { ok: true, output: toOutput(spacingToken(live.snapshot, use, options), settings) };
}

/** The colour of a pixel from the eyedropper. */
export function capturePixel(live: LiveSnapshot, hex: string, settings: CaptureSettings): Result {
  const token = colorToken(live.snapshot, { pixel: hex }, { captured: CAPTURED() });
  return token ? { ok: true, output: toOutput(token, settings) } : { ok: false, message: `Not a colour: ${hex}` };
}

/** The distance between two elements (a Spacing drag). */
export function captureDistance(live: LiveSnapshot, a: ElementSnapshot, b: ElementSnapshot, settings: CaptureSettings): Result {
  return { ok: true, output: toOutput(distanceToken(live.snapshot, a, b, { captured: CAPTURED() }), settings) };
}

/** "The whole system": the page's typography, colours or spacing. */
export function captureSystem(tool: ToolId, live: LiveSnapshot, settings: CaptureSettings): Result {
  const options = { captured: CAPTURED() };
  const system = tool === 'text' ? typographySystem(live.snapshot, options) : tool === 'color' ? colorSystem(live.snapshot, options) : spacingSystem(live.snapshot, options);
  if (!system) return { ok: false, message: `This page has no ${tool === 'text' ? 'visible text' : tool === 'color' ? 'visible colours' : 'spacing'} to capture.` };
  return { ok: true, output: toOutput(system, settings) };
}
