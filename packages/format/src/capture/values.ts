/** Writing captured values with the user's unit and color settings. Pure and browser-safe. */
import { formatHex, formatHex8, formatHsl, formatRgb, oklch, parse, type Color } from 'culori';
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

const num = (n: number, digits: number) => round(Math.abs(n) < 1e-9 ? 0 : n, digits);

/**
 * A computed transform as people write it: the browser reports "matrix(1, 0, 0, 1, 0, -12)", this
 * gives "translateY(-12px)". 2D matrices (and 3D ones that are really 2D) become translate, rotate
 * and scale; anything with skew, a mirror or depth is returned unchanged.
 */
export function formatTransform(computed: string): string {
  const text = computed.trim();
  const m = /^matrix(3d)?\(([^)]*)\)$/.exec(text);
  if (!m) return text;
  const v = m[2]!.split(',').map(Number);
  if (v.some(Number.isNaN)) return text;
  let a: number, b: number, c: number, d: number, e: number, f: number;
  if (m[1]) {
    if (v.length !== 16) return text;
    const flat = [2, 3, 6, 7, 8, 9, 11, 14].every(i => Math.abs(v[i]!) < 1e-9) && v[10] === 1 && v[15] === 1;
    if (!flat) return text;
    [a, b, c, d, e, f] = [v[0]!, v[1]!, v[4]!, v[5]!, v[12]!, v[13]!];
  } else {
    if (v.length !== 6) return text;
    [a, b, c, d, e, f] = v as [number, number, number, number, number, number];
  }
  // translate(e, f) rotate(θ) scale(sx, sy) is [sx·cos, sx·sin, -sy·sin, sy·cos, e, f]
  const sx = Math.hypot(a, b);
  if (sx < 1e-9 || a * d - b * c <= 0) return text;
  const ax = a / sx;
  const bx = b / sx;
  const skew = ax * c + bx * d;
  const sy = Math.hypot(c - ax * skew, d - bx * skew);
  if (Math.abs(skew / sy) > 1e-3) return text;
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  const parts: string[] = [];
  const x = num(e, 2);
  const y = num(f, 2);
  if (x !== '0' && y !== '0') parts.push(`translate(${x}px, ${y}px)`);
  else if (y !== '0') parts.push(`translateY(${y}px)`);
  else if (x !== '0') parts.push(`translateX(${x}px)`);
  if (num(angle, 2) !== '0') parts.push(`rotate(${num(angle, 2)}deg)`);
  const [sxs, sys] = [num(sx, 3), num(sy, 3)];
  if (sxs !== '1' || sys !== '1') parts.push(sxs === sys ? `scale(${sxs})` : `scale(${sxs}, ${sys})`);
  return parts.length ? parts.join(' ') : 'none';
}

/** The layers of a list value ("a, b(c, d), e" -> ["a", "b(c, d)", "e"]). */
const layers = (text: string) => text.split(/,(?![^(]*\))/).map(l => l.trim()).filter(Boolean);
const LAYER_COLOR = /rgba?\([^)]*\)|hsla?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i;

/**
 * A box-shadow without the layers nobody sees: Tailwind writes "transparent 0px 0px 0px 0px" rings
 * before every real shadow. A shadow of only such layers is "none".
 */
export function formatShadow(computed: string): string {
  const text = computed.trim();
  if (text === 'none') return text;
  const all = layers(text);
  const seen = all.filter(l => {
    const color = LAYER_COLOR.exec(l)?.[0];
    return !(color && isTransparent(color));
  });
  return seen.length === all.length ? text : seen.length ? seen.join(', ') : 'none';
}

/** A px number from a computed length ("16px" -> 16), or null. */
export function pxValue(computed: string): number | null {
  const m = /^(-?\d*\.?\d+)px$/.exec(computed.trim());
  return m ? Number(m[1]) : null;
}

/**
 * A color, or undefined when the text is not one. culori's parse can throw instead of returning
 * undefined on some non-color values (lattice.com's "drop-shadow(0 0px 1px rgb(0 31 31 / 24%)) ..."
 * custom properties), so every color read goes through here.
 */
export function parseColor(text: string): Color | undefined {
  try {
    return parse(text.trim());
  } catch {
    return undefined;
  }
}

/** True for a fully transparent color. */
export function isTransparent(computed: string): boolean {
  const c = parseColor(computed);
  return computed.trim() === 'transparent' || (c !== undefined && (c.alpha ?? 1) === 0);
}

/** A color as the settings ask. Unknown values (currentcolor, gradients) are returned unchanged. */
export function formatColor(computed: string, settings: CaptureSettings = {}): string {
  const s = resolveSettings(settings);
  const c = parseColor(computed);
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
  const c = parseColor(computed);
  if (!c) return null;
  return (c.alpha ?? 1) < 1 ? formatHex8(c) : formatHex(c);
}
