/**
 * The page snapshot every capture tool works on. The DOM reader (dom.ts) builds it from the
 * live page; the analysis (text.ts, color.ts, spacing.ts) only reads it, so it is plain data,
 * easy to test and identical in both toolbar shells.
 */

/** Computed style properties the tools read. */
export const SNAPSHOT_PROPERTIES = [
  'display', 'visibility', 'opacity',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-style', 'text-transform', 'text-decoration-line', 'color',
  'background-color', 'background-image',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-width', 'outline-style', 'outline-color',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap',
  'fill', 'stroke', 'stroke-width',
  // The Component tool (M5) also reads these
  'width', 'height', 'flex-direction', 'align-items', 'justify-content',
  'border-radius', 'box-shadow', 'cursor', 'outline-offset', 'text-align', 'transform',
  'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  'animation-name', 'animation-duration', 'animation-timing-function', 'animation-iteration-count'
] as const;
export type SnapshotProperty = (typeof SNAPSHOT_PROPERTIES)[number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementSnapshot {
  /** Index in the snapshot. */
  id: number;
  /** Lowercase tag name. */
  tag: string;
  /** Explicit or implicit ARIA role, if any. */
  role: string | null;
  /** A selector that finds this element (structure, not hashed classes, where possible). */
  selector: string;
  rect: Rect;
  /** Rendered and not hidden (visibility, display, zero size, zero opacity). */
  visible: boolean;
  /** Has its own non-whitespace text (not only through children). */
  hasText: boolean;
  /** Inside a shadow root. */
  inShadow: boolean;
  styles: Partial<Record<SnapshotProperty, string>>;
  /** What the site wrote, for properties where it is known and differs: "var(--space-4)", "clamp(...)". */
  authored: Partial<Record<SnapshotProperty, string>>;
  /** Properties whose value is only the browser's default for this tag (e.g. a paragraph's 1em margin). */
  browserDefault?: Partial<Record<SnapshotProperty, true>>;
  /** Properties a stylesheet rule or inline style sets on this element itself (not inherited). */
  declared?: Partial<Record<SnapshotProperty, true>>;
}

export interface PageSnapshot {
  /** The page URL (the format drops the query and fragment). */
  url: string;
  /** Computed font size of the root element, in px. */
  rootFontSize: number;
  /** Custom properties defined on :root, resolved: { "--color-primary": "#0f62fe" }. */
  customProperties: Record<string, string>;
  elements: ElementSnapshot[];
  /** False when a stylesheet could not be read (cross-origin), so "declared" may miss rules. */
  stylesReadable?: boolean;
}

/** The custom property an authored value goes through: "var(--space-4, 16px)" -> "--space-4". */
export function tokenOf(authored: string | undefined): string | undefined {
  const m = authored ? /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(authored.trim()) : null;
  return m?.[1];
}

/** A captured value from a snapshot property: computed, plus authored and token when known. */
export function valueOf(el: ElementSnapshot, prop: SnapshotProperty): { computed: string; authored?: string; token?: string } {
  const computed = el.styles[prop] ?? '';
  const authored = el.authored[prop];
  const token = tokenOf(authored);
  return { computed, ...(authored && authored !== computed ? { authored } : {}), ...(token ? { token } : {}) };
}
