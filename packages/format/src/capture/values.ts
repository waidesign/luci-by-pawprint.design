/** Writing captured values with the user's unit and color settings. Pure and browser-safe. */
import { formatHex, formatHex8, formatHsl, formatRgb, oklch, parse } from 'culori';
import { captureSettingsSchema, type CaptureSettings } from './schema.js';

export type ResolvedSettings = { units: 'px' | 'rem' | 'both'; colors: 'hex' | 'rgb' | 'hsl' | 'oklch'; rootFontSize: number };

export const resolveSettings = (settings: CaptureSettings = {}): ResolvedSettings => captureSettingsSchema.parse(settings);

/** Round to at most `digits` decimals and drop trailing zeros: 1.50 -> "1.5", 2.000 -> "2". */
export const round = (n: number, digits = 3): string => {
  const s = n.toFixed(digits).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

const PX = /(-?\d*\.?\d+)px\b/g;
const HAS_PX = /\d+px\b/;

/**
 * A length as the settings ask: "16px", "1rem" or "16px (1rem)". Only px values are converted;
 * keywords (normal, auto) and other units are left as they are. Works on lists ("12px 20px").
 */
export function formatLength(computed: string, settings: CaptureSettings = {}): string {
  const s = resolveSettings(settings);
  const px = computed.replace(PX, (_m, n: string) => `${round(Number(n))}px`);
  if (s.units === 'px' || !HAS_PX.test(computed)) return px;
  const rem = computed.replace(PX, (_m, n: string) => (Number(n) === 0 ? '0' : `${round(Number(n) / s.rootFontSize, 4)}rem`));
  return s.units === 'rem' ? rem : `${px} (${rem})`;
}

/** A px number from a computed length ("16px" -> 16), or null. */
export function pxValue(computed: string): number | null {
  const m = /^(-?\d*\.?\d+)px$/.exec(computed.trim());
  return m ? Number(m[1]) : null;
}

/** True for a fully transparent color. */
export function isTransparent(computed: string): boolean {
  const c = parse(computed.trim());
  return computed.trim() === 'transparent' || (c !== undefined && (c.alpha ?? 1) === 0);
}

/** A color as the settings ask. Unknown values (currentcolor, gradients) are returned unchanged. */
export function formatColor(computed: string, settings: CaptureSettings = {}): string {
  const s = resolveSettings(settings);
  const c = parse(computed.trim());
  if (!c) return computed.trim();
  if ((c.alpha ?? 1) === 0) return 'transparent';
  switch (s.colors) {
    case 'hex':
      return (c.alpha ?? 1) < 1 ? formatHex8(c) : formatHex(c);
    case 'rgb':
      return formatRgb(c);
    case 'hsl':
      return formatHsl(c);
    case 'oklch': {
      const o = oklch(c);
      const alpha = (o.alpha ?? 1) < 1 ? ` / ${round(o.alpha ?? 1, 3)}` : '';
      return `oklch(${round(o.l * 100, 2)}% ${round(o.c, 4)} ${round(o.h ?? 0, 2)}${alpha})`;
    }
  }
}

/** One key per color, the same for "rgb(15, 98, 254)" and "#0f62fe": for grouping and matching. */
export function colorKey(computed: string): string | null {
  const c = parse(computed.trim());
  if (!c) return null;
  return (c.alpha ?? 1) < 1 ? formatHex8(c) : formatHex(c);
}
