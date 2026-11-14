/**
 * Responsive capture (v0.3.4): a component or section read at 2 or 3 window widths, chosen from the
 * site's own media queries that style it, and the properties that differ between those widths.
 *
 * Two ways to read another width: resize the real window (the extension, through the debugger:
 * `setWidth`), or load the same page in a hidden frame of that width (any shell; the page must allow
 * itself in a frame). The pure parts (thresholds, widths, differences) are tested without a browser.
 */
import type { CapturedValue, Responsive } from '@luci/format/capture';
import { LUCI_UI_ATTRIBUTE } from './dom.js';
import { hasRules, isMediaRule, isStyleRule } from './realm.js';

/** The name of Luci's width frames: the dev toolbar does not start inside one. */
export const LUCI_FRAME_NAME = 'luci-width';
/** The widths that stand for "a phone" and "a desktop" when a range has no better one. */
export const PHONE_WIDTH = 375;
export const DESKTOP_WIDTH = 1280;
/** At most this many breakpoints (so at most 3 widths). */
export const MAX_THRESHOLDS = 2;

/**
 * The widths where a media condition starts or stops applying: "(min-width: 768px)" -> [768],
 * "(max-width: 767px)" -> [768], "(width >= 64em)" -> [1024]. em and rem count 16px.
 */
export function mediaThresholds(condition: string, rootFontSize = 16): number[] {
  const px = (n: string, unit: string) => Number(n) * (unit === 'px' ? 1 : rootFontSize);
  const out: number[] = [];
  for (const m of condition.matchAll(/\(\s*(min|max)-width\s*:\s*(\d*\.?\d+)(px|em|rem)\s*\)/gi)) {
    const v = px(m[2]!, m[3]!.toLowerCase());
    out.push(m[1]!.toLowerCase() === 'min' ? Math.ceil(v) : Math.floor(v) + 1);
  }
  for (const m of condition.matchAll(/\(\s*width\s*(>=|>|<=|<)\s*(\d*\.?\d+)(px|em|rem)\s*\)/gi)) {
    const v = px(m[2]!, m[3]!.toLowerCase());
    out.push(m[1] === '>=' || m[1] === '<' ? Math.ceil(v) : Math.floor(v) + 1);
  }
  return [...new Set(out)].filter(t => t > 1);
}

/**
 * The widths to read at: one per range between breakpoints, the breakpoints that style the most
 * rules first (at most two). Below the first, a phone (375px, or just under it); between two, the
 * breakpoint itself; above the last, a desktop (1280px, or the breakpoint). Empty without breakpoints.
 */
export function pickWidths(thresholds: readonly { px: number; weight: number }[]): number[] {
  return widthsFor(chooseThresholds(thresholds));
}

/** The breakpoints that style the most rules (at most two), narrowest first. */
export function chooseThresholds(thresholds: readonly { px: number; weight: number }[]): number[] {
  const weights = new Map<number, number>();
  for (const t of thresholds) weights.set(t.px, (weights.get(t.px) ?? 0) + t.weight);
  return [...weights.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, MAX_THRESHOLDS).map(([px]) => px).sort((a, b) => a - b);
}

/** One width per range between the breakpoints. */
export function widthsFor(chosen: readonly number[]): number[] {
  if (!chosen.length) return [];
  const first = chosen[0]!;
  const last = chosen[chosen.length - 1]!;
  return [Math.min(PHONE_WIDTH, first - 1), ...chosen.slice(0, -1), Math.max(DESKTOP_WIDTH, last)];
}

/** One part as read at one width: its name (unique in the reading) and its styles. */
export interface PartReading { part: string; styles: { property: string; value: CapturedValue }[] }

/** "344px 344px 344px" -> 3: grid columns compare by count, not by track widths that follow the window. */
const columnCount = (computed: string) => (computed.trim() === 'none' ? 0 : computed.split(/\s+(?![^(]*\))/).filter(Boolean).length);
const columnsText = (n: number) => `${n} column${n === 1 ? '' : 's'}`;
/** Sizes the site wrote the same way at every width ("100%", "auto") follow the window: not a change. */
const SIZES = /^(width|height|min-width|max-width|min-height|max-height)$/;

/**
 * The properties that differ between the readings (one per width, null where it could not be read):
 * a part found at some widths only gives a `shown` row; grid columns compare by count; a size the
 * site wrote the same way everywhere is fluid, not a change. Parts and properties in reading order.
 */
export function responsiveChanges(readings: readonly (readonly PartReading[] | null)[]): Responsive['changes'] {
  const parts: string[] = [];
  for (const r of readings) for (const p of r ?? []) if (!parts.includes(p.part)) parts.push(p.part);
  const changes: Responsive['changes'] = [];
  for (const part of parts) {
    const found = readings.map(r => (r ? r.find(p => p.part === part) ?? null : undefined));
    // A width that could not be read at all says nothing about the part
    if (found.some(f => f === null) && found.some(f => f)) {
      changes.push({ part, property: 'shown', values: found.map(f => (f === undefined ? null : f ? 'yes' : 'no')) });
    }
    const properties: string[] = [];
    for (const f of found) for (const s of f?.styles ?? []) if (!properties.includes(s.property)) properties.push(s.property);
    for (const property of properties) {
      const values = found.map(f => f?.styles.find(s => s.property === property)?.value);
      if (SIZES.test(property) && values.every(v => v?.authored && v.authored === values[0]?.authored && !v.authored.includes('var('))) continue;
      const texts = values.map(v => (!v ? null : property === 'grid-template-columns' ? columnsText(columnCount(v.computed)) : v.computed));
      // Only where the part is there: a hidden part's missing styles are its `shown` row
      const present = texts.filter((_, i) => found[i]);
      if (new Set(present).size > 1) changes.push({ part, property, values: texts });
    }
  }
  return changes;
}

/** Give each repeated part name a number in order: heading, heading (2), heading (3). */
export function uniqueParts(parts: readonly PartReading[]): PartReading[] {
  const seen = new Map<string, number>();
  return parts.map(p => {
    const n = (seen.get(p.part) ?? 0) + 1;
    seen.set(p.part, n);
    return n > 1 ? { ...p, part: `${p.part} (${n})` } : p;
  });
}

/** Rules inside a media (or @supports, @layer) block, flattened, each with its media condition. */
function mediaStyleRules(rules: CSSRuleList, condition: string | null, out: { condition: string; rule: CSSStyleRule }[]): void {
  for (const rule of Array.from(rules)) {
    if (isMediaRule(rule)) mediaStyleRules(rule.cssRules, condition ? `${condition} and ${rule.conditionText}` : rule.conditionText, out);
    else if (isStyleRule(rule)) { if (condition) out.push({ condition, rule }); }
    else if (hasRules(rule)) mediaStyleRules(rule.cssRules, condition, out);
  }
}

/**
 * The media conditions that style an element or anything inside it (a rule in the block matches
 * one of them), or set custom properties on an element around it. With the number of such rules.
 * Stylesheets the page cannot read (another origin without CORS) are skipped.
 */
export function mediaQueriesFor(root: Element): { condition: string; rules: number }[] {
  const doc = root.ownerDocument;
  const inside = [root, ...Array.from(root.querySelectorAll('*')).slice(0, 600)];
  const around: Element[] = [];
  for (let n = root.parentElement; n; n = n.parentElement) around.push(n);
  const found = new Map<string, number>();
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const list: { condition: string; rule: CSSStyleRule }[] = [];
    mediaStyleRules(rules, null, list);
    for (const { condition, rule } of list) {
      const matches = (el: Element) => { try { return el.matches(rule.selectorText); } catch { return false; } };
      const setsVars = Array.from(rule.style).some(p => p.startsWith('--'));
      if (inside.some(matches) || (setsVars && around.some(matches))) found.set(condition, (found.get(condition) ?? 0) + 1);
    }
  }
  return [...found.entries()].map(([condition, rules]) => ({ condition, rules }));
}

/** Sets the window's width for reading (the extension, through the debugger); null puts it back. */
export type ViewportWidth = (width: number | null) => Promise<void>;

const frames = (win: Window, n = 2) => new Promise<void>(resolve => {
  const step = (left: number) => (left ? win.requestAnimationFrame(() => step(left - 1)) : resolve());
  step(n);
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Read once `read` gives something, trying until the time is up (a page still rendering in a frame). */
async function until<T>(read: () => T | null, timeoutMs: number, what: string): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    let value: T | null = null;
    try { value = read(); } catch { value = null; }
    if (value !== null) return value;
    if (Date.now() > end) throw new Error(what);
    await sleep(150);
  }
}

/** The page at one width in a hidden frame: loaded, rendered, read, removed. */
async function readInFrame<T>(doc: Document, width: number, read: (doc: Document) => T | null, timeoutMs: number): Promise<T> {
  const win = doc.defaultView!;
  const frame = doc.createElement('iframe');
  frame.setAttribute(LUCI_UI_ATTRIBUTE, '');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.name = LUCI_FRAME_NAME;
  frame.style.cssText = `position:fixed;top:0;left:${-width - 200}px;width:${width}px;height:${win.innerHeight}px;border:0;opacity:0;pointer-events:none;`;
  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    setTimeout(() => reject(new Error(`the page did not load in a ${width}px frame within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  });
  frame.src = doc.location.href;
  doc.documentElement.appendChild(frame);
  try {
    await loaded;
    let inner: Document | null = null;
    try { inner = frame.contentDocument; } catch { inner = null; }
    if (!inner || inner.location.href === 'about:blank') throw new Error('this page does not allow itself in a frame (X-Frame-Options or Content-Security-Policy)');
    const ready = inner;
    const value = await until(() => read(ready), timeoutMs, `the component did not appear in the ${width}px frame`);
    await frames(frame.contentWindow!, 2);
    return (read(ready) ?? value);
  } finally {
    frame.remove();
  }
}

/**
 * Read something at each width: by resizing the window when the shell can (`setWidth`), else in a
 * hidden frame of the same page. The window is always put back. `onWidth` says where Luci is.
 */
export async function readAtWidths<T>(
  doc: Document,
  widths: readonly number[],
  read: (doc: Document) => T | null,
  options: { setWidth?: ViewportWidth; timeoutMs?: number; onWidth?: (width: number, index: number) => void } = {}
): Promise<T[]> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const out: T[] = [];
  if (options.setWidth) {
    const win = doc.defaultView!;
    try {
      for (const [i, width] of widths.entries()) {
        options.onWidth?.(width, i);
        await options.setWidth(width);
        await until(() => (Math.abs(win.innerWidth - width) <= 1 ? true : null), 3000, `the window did not change to ${width}px`);
        await frames(win, 2);
        out.push(await until(() => read(doc), 3000, `the component is not on the page at ${width}px`));
      }
    } finally {
      await options.setWidth(null);
      await frames(win, 2);
    }
    return out;
  }
  for (const [i, width] of widths.entries()) {
    options.onWidth?.(width, i);
    out.push(await readInFrame(doc, width, read, timeoutMs));
  }
  return out;
}
