/**
 * After-Edit Blink (v0.7): snapshots watched elements' computed styles, size and text before code
 * edits, detects real post-edit visual changes on HMR / DOM updates (ignoring user input and Luci's
 * own UI), and powers a non-destructive "Blink before/after" peek toggle.
 */

export const BLINK_PULSE_MS = 950;
export const BLINK_PILL_MS = 3800;
export const BLINK_USER_INPUT_GUARD_MS = 600;
export const BLINK_POLL_MS = 1200;
export const BLINK_PEEK_ATTR = 'data-luci-blink-peek';
export const BLINK_BASELINES_KEY = 'luci.blink.baselines';

/** Visual & layout computed properties compared between pre-edit and post-edit snapshots. */
export const BLINK_STYLE_PROPS = [
  'color',
  'background-color',
  'opacity',
  'box-shadow',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'display',
  'flex-direction',
  'align-items',
  'justify-content'
] as const;

export interface BlinkSnapshot {
  styles: Record<string, string>;
  rect: { width: number; height: number };
  text: string;
}

export interface StyleChange {
  before: string;
  after: string;
}

export interface BlinkDiff {
  changed: boolean;
  /** Logical property names changed (e.g. 'padding', 'background-color', 'size', 'text'). */
  props: string[];
  /** Exact per-CSS-property before/after values used by before/after peek. */
  changedStyles: Record<string, StyleChange>;
  sizeChanged: boolean;
  textChanged: boolean;
  count: number;
  summary: string;
}

export interface PeekRestore {
  el: HTMLElement;
  hadAttr: boolean;
  prevStyleAttr: string | null;
}

function logicalPropName(prop: string): string {
  if (prop.startsWith('padding-')) return 'padding';
  if (prop.startsWith('margin-')) return 'margin';
  if (/^border-.+-width$/.test(prop)) return 'border-width';
  if (/^border-.+-color$/.test(prop)) return 'border-color';
  if (/^border-.+-radius$/.test(prop)) return 'border-radius';
  return prop;
}

/** Capture a lightweight computed-style, geometry and text snapshot of a DOM element. */
export function snapshotElement(win: Window, el: Element): BlinkSnapshot {
  const cs = win.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of BLINK_STYLE_PROPS) {
    styles[prop] = cs.getPropertyValue(prop).trim();
  }
  const r = el.getBoundingClientRect();
  return {
    styles,
    rect: { width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 },
    text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  };
}

/** Compare two element snapshots and summarize what visually changed. */
export function diffSnapshots(before: BlinkSnapshot, after: BlinkSnapshot): BlinkDiff {
  const changedStyles: Record<string, StyleChange> = {};
  const logical = new Set<string>();

  for (const prop of BLINK_STYLE_PROPS) {
    const a = before.styles[prop] ?? '';
    const b = after.styles[prop] ?? '';
    if (a !== b) {
      changedStyles[prop] = { before: a, after: b };
      logical.add(logicalPropName(prop));
    }
  }

  const sizeChanged =
    Math.abs(before.rect.width - after.rect.width) >= 1 ||
    Math.abs(before.rect.height - after.rect.height) >= 1;
  const textChanged = before.text !== after.text;

  const props = [...logical];
  if (sizeChanged && !props.length) props.push('size');
  else if (sizeChanged) props.push('size');
  if (textChanged) props.push('text');

  const styleCount = logical.size;
  const changed = styleCount > 0 || sizeChanged || textChanged;
  const count = props.length;

  let summary = '';
  if (changed) {
    if (styleCount > 0 && !textChanged) {
      summary = `${styleCount} style${styleCount === 1 ? '' : 's'}`;
    } else if (styleCount === 0 && textChanged && !sizeChanged) {
      summary = 'text';
    } else if (styleCount === 0 && sizeChanged && !textChanged) {
      summary = 'size';
    } else {
      summary = `${count} change${count === 1 ? '' : 's'}`;
    }
  }

  return { changed, props, changedStyles, sizeChanged, textChanged, count, summary };
}

/**
 * Temporarily apply pre-edit computed style values onto `el` so the user can visually blink
 * between Before and After on the live page. Returns a token that cleanly restores the original
 * `style` attribute with zero residue.
 */
export function applyBeforePeek(
  el: Element,
  changedStyles: Readonly<Record<string, StyleChange>>
): PeekRestore | null {
  if (!(el instanceof HTMLElement)) return null;
  const entries = Object.entries(changedStyles);
  if (!entries.length) return null;
  const hadAttr = el.hasAttribute('style');
  const prevStyleAttr = el.getAttribute('style');
  el.setAttribute(BLINK_PEEK_ATTR, 'before');
  for (const [prop, { before }] of entries) {
    if (before) el.style.setProperty(prop, before, 'important');
  }
  return { el, hadAttr, prevStyleAttr };
}

/** Cleanly undo `applyBeforePeek`, restoring the element's exact original inline `style` attribute. */
export function restorePeek(restore: PeekRestore | null | undefined): void {
  if (!restore) return;
  const { el, hadAttr, prevStyleAttr } = restore;
  el.removeAttribute(BLINK_PEEK_ATTR);
  if (hadAttr && prevStyleAttr !== null) {
    el.setAttribute('style', prevStyleAttr);
  } else {
    // Flush Blink's dirty inline-style cache before removing the attribute so Chromium leaves no empty style=""
    el.style.cssText = '';
    void el.getAttribute('style');
    el.removeAttribute('style');
  }
}

/** True when a MutationRecord batch contains a stylesheet update (e.g. Vite/Webpack/Next HMR CSS). */
export function isStylesheetMutation(records: readonly MutationRecord[]): boolean {
  const isSheetNode = (n: Node): boolean => {
    if (!(n instanceof Element)) return false;
    const tag = n.tagName.toUpperCase();
    if (tag === 'STYLE') return true;
    if (tag === 'LINK' && (n.getAttribute('rel') ?? '').toLowerCase().includes('stylesheet')) return true;
    return false;
  };
  for (const r of records) {
    if (isSheetNode(r.target)) return true;
    if (r.target instanceof Element && r.target.closest('style')) return true;
    for (const n of r.addedNodes) if (isSheetNode(n)) return true;
    for (const n of r.removedNodes) if (isSheetNode(n)) return true;
  }
  return false;
}

/** True when an element's rect sits outside the current viewport. */
export function isOffscreen(rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>, win: Pick<Window, 'innerWidth' | 'innerHeight'>): boolean {
  return rect.bottom < 0 || rect.top > win.innerHeight || rect.right < 0 || rect.left > win.innerWidth;
}

/** Expand a CSS 1–4 value box shorthand ("12px 20px") into [top, right, bottom, left]. */
export function expandBoxShorthand(raw: string): [string, string, string, string] | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('(')) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return [parts[0]!, parts[0]!, parts[0]!, parts[0]!];
  if (parts.length === 2) return [parts[0]!, parts[1]!, parts[0]!, parts[1]!];
  if (parts.length === 3) return [parts[0]!, parts[1]!, parts[2]!, parts[1]!];
  if (parts.length === 4) return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
  return null;
}

const DIRECT_TARGET_STYLES = ['display', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'gap'] as const;

/**
 * Build a pre-edit baseline from a saved FeedbackItem's `target.styles` overlaid onto `live`.
 * Lets After-Edit Blink detect edits that already landed across a full page reload (Next.js Fast
 * Refresh fallback, manual F5, or fresh tab) without producing false positives on unchanged fields.
 */
export function baselineFromItem(
  target: { styles?: Record<string, string> },
  live: BlinkSnapshot
): BlinkSnapshot {
  const saved = target.styles;
  if (!saved || !Object.keys(saved).length) return live;
  const styles: Record<string, string> = { ...live.styles };
  for (const prop of DIRECT_TARGET_STYLES) {
    if (saved[prop]) styles[prop] = saved[prop]!;
  }
  if (saved['padding']) {
    const p = expandBoxShorthand(saved['padding']);
    if (p) {
      styles['padding-top'] = p[0];
      styles['padding-right'] = p[1];
      styles['padding-bottom'] = p[2];
      styles['padding-left'] = p[3];
    }
  }
  if (saved['margin']) {
    const m = expandBoxShorthand(saved['margin']);
    if (m) {
      styles['margin-top'] = m[0];
      styles['margin-right'] = m[1];
      styles['margin-bottom'] = m[2];
      styles['margin-left'] = m[3];
    }
  }
  if (saved['border-radius']) {
    const r = expandBoxShorthand(saved['border-radius']);
    if (r) {
      styles['border-top-left-radius'] = r[0];
      styles['border-top-right-radius'] = r[1];
      styles['border-bottom-right-radius'] = r[2];
      styles['border-bottom-left-radius'] = r[3];
    }
  }
  return { styles, rect: { ...live.rect }, text: live.text };
}

/** Read persisted pre-edit baselines for `route` from sessionStorage (safe when storage is blocked). */
export function readBlinkBaselines(storage: Pick<Storage, 'getItem'> | null | undefined, route: string): Map<string, BlinkSnapshot> {
  const out = new Map<string, BlinkSnapshot>();
  if (!storage) return out;
  try {
    const raw = storage.getItem(BLINK_BASELINES_KEY);
    if (!raw) return out;
    const all = JSON.parse(raw) as Record<string, Record<string, BlinkSnapshot>>;
    const forRoute = all?.[route];
    if (forRoute && typeof forRoute === 'object') {
      for (const [ref, snap] of Object.entries(forRoute)) {
        if (snap && typeof snap === 'object' && snap.styles && snap.rect) out.set(ref, snap);
      }
    }
  } catch {
    // ignore corrupt or restricted storage
  }
  return out;
}

/** Persist pre-edit baselines for `route` to sessionStorage so they survive Next.js/HMR full reloads. */
export function writeBlinkBaselines(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  route: string,
  baselines: ReadonlyMap<string, BlinkSnapshot>
): void {
  if (!storage) return;
  try {
    let all: Record<string, Record<string, BlinkSnapshot>> = {};
    try {
      const raw = storage.getItem(BLINK_BASELINES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') all = parsed as Record<string, Record<string, BlinkSnapshot>>;
      }
    } catch { /* start fresh */ }
    const forRoute: Record<string, BlinkSnapshot> = {};
    for (const [ref, snap] of baselines.entries()) forRoute[ref] = snap;
    all[route] = forRoute;
    storage.setItem(BLINK_BASELINES_KEY, JSON.stringify(all));
  } catch {
    // ignore quota or restricted storage
  }
}
