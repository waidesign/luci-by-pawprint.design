/**
 * Screenshot mode (v0.4): a file estimated from an image, for apps and pictures that cannot be
 * inspected. Only colors can be read from pixels, so the file is a color system with method
 * "estimated": the image's palette, each color with its share of the picture, and a role guessed from
 * how it sits against the rest (the largest area is the background; the color that stands out most
 * against it, the text; the most saturated, the accent; a faint line color, the border).
 * Text styles and spacing cannot be read from an image, and the file says so. Pure and browser-safe.
 */
import type { ColorRole, ColorSystem } from './schema.js';

export interface PaletteColor {
  /** The color: red, green, blue (0-255). */
  rgb: readonly [number, number, number];
  /** Its share of the image's visible pixels, 0-1. */
  share: number;
}

/** Colors closer than this (in RGB) are one color: anti-aliasing and compression make many near-copies. */
const MERGE_DISTANCE = 28;
/** A color must cover at least this share of the image to count. */
const MIN_SHARE = 0.004;

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * The image's palette from its RGBA pixels (a canvas's ImageData.data), largest share first: pixels
 * are counted in 5-bit buckets, then buckets close in color merge into one color, weighted by count.
 */
export function estimatePalette(rgba: ArrayLike<number>, options: { maxColors?: number } = {}): PaletteColor[] {
  const max = options.maxColors ?? 8;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) { bin.n++; bin.r += r; bin.g += g; bin.b += b; } else bins.set(key, { n: 1, r, g, b });
    total++;
  }
  if (!total) return [];
  const clusters: { n: number; r: number; g: number; b: number }[] = [];
  for (const bin of [...bins.values()].sort((x, y) => y.n - x.n)) {
    const center = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const near = clusters.find(c => dist([c.r / c.n, c.g / c.n, c.b / c.n], center) < MERGE_DISTANCE);
    if (near) { near.n += bin.n; near.r += bin.r; near.g += bin.g; near.b += bin.b; } else clusters.push({ ...bin });
  }
  return clusters
    .map(c => ({ rgb: [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)] as const, share: c.n / total }))
    .filter(c => c.share >= MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, max);
}

const channel = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (c: readonly number[]) => 0.2126 * channel(c[0]!) + 0.7152 * channel(c[1]!) + 0.0722 * channel(c[2]!);
/** WCAG contrast ratio of two colors. */
export const contrastOf = (a: readonly number[], b: readonly number[]) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const chroma = (c: readonly number[]) => Math.max(c[0]!, c[1]!, c[2]!) - Math.min(c[0]!, c[1]!, c[2]!);

/** Each palette color's role, guessed from how it sits against the background. */
export function guessRoles(palette: readonly PaletteColor[]): { color: PaletteColor; role: ColorRole }[] {
  if (!palette.length) return [];
  const [bg, ...rest] = palette as [PaletteColor, ...PaletteColor[]];
  const out: { color: PaletteColor; role: ColorRole }[] = [{ color: bg, role: 'background' }];
  const left = new Set(rest);
  const take = (c: PaletteColor | undefined, role: ColorRole) => { if (c) { out.push({ color: c, role }); left.delete(c); } };
  // Text: a near-neutral color that stands out most against the background (readable: 3:1 or more);
  // a strongly colored one is an accent, even when it is readable
  take([...left].filter(c => contrastOf(c.rgb, bg.rgb) >= 3 && chroma(c.rgb) < 80).sort((a, b) => contrastOf(b.rgb, bg.rgb) - contrastOf(a.rgb, bg.rgb))[0], 'text');
  // Accent: the most saturated, weighted by how much of the image it covers
  take([...left].filter(c => chroma(c.rgb) >= 60).sort((a, b) => chroma(b.rgb) * Math.sqrt(b.share) - chroma(a.rgb) * Math.sqrt(a.share))[0], 'accent');
  // Border: a faint line color, close to the background but not it
  take([...left].filter(c => { const k = contrastOf(c.rgb, bg.rgb); return k > 1.05 && k < 1.8; })[0], 'border');
  // The rest: surfaces close to the background, colorful ones as accents, the others as text
  for (const c of [...left]) {
    const k = contrastOf(c.rgb, bg.rgb);
    take(c, k < 1.5 ? 'background' : chroma(c.rgb) >= 60 ? 'accent' : 'text');
  }
  return out;
}

const rgbText = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
/** "My Screenshot.png" -> "my-screenshot". */
export const imageSlug = (fileName: string) =>
  fileName.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';

/**
 * The color system estimated from an image: name image-<file>, source file:///<file name> (no path),
 * method estimated; each role row's Uses is the color's share of the image in percent.
 */
export function imageColorSystem(palette: readonly PaletteColor[], options: { file: string; captured: string }): ColorSystem | null {
  const roles = guessRoles(palette);
  if (!roles.length) return null;
  return {
    meta: { name: `image-${imageSlug(options.file)}`, scope: 'system', type: 'color', source: `file:///${encodeURIComponent(options.file || 'image')}`, captured: options.captured, method: 'estimated' },
    roles: roles.map(({ color, role }) => ({ role, value: { computed: rgbText(color.rgb) }, count: Math.max(1, Math.round(color.share * 100)), properties: ['image'] })),
    tokens: []
  };
}

/** The file name for an image's color system: image-<file>.system.color.design.md. */
export const imageFileName = (file: string) => `image-${imageSlug(file)}.system.color.design.md`;
