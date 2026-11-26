/**
 * Loads Luci's fonts (Fredoka, Inter, JetBrains Mono, bundled in fonts.data.ts) into the page's
 * font set, once per page, under "Luci ..." family names. Built from bytes with the FontFace API:
 * nothing is fetched, so the page's Content-Security-Policy can't block them, and shadow roots
 * (where Luci's surfaces live) use the document's fonts. The token font stacks name these first and
 * keep the kit's fallbacks (system-ui, ui-monospace) for any browser that can't load them.
 */
import { FONT_FILES } from './fonts.data.js';

export const FONT_FAMILIES = FONT_FILES.map(f => f.family);

const bytes = (base64: string): ArrayBuffer => {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
};

/** Add the fonts to the document once. Safe to call on every mount; does nothing without FontFace. */
export function loadFonts(doc: Document = document): void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const Face = win?.FontFace ?? (typeof FontFace === 'undefined' ? undefined : FontFace);
  if (!Face || !doc.fonts) return;
  const have = new Set<string>();
  doc.fonts.forEach(f => have.add(f.family.replace(/["']/g, '')));
  for (const f of FONT_FILES) {
    if (have.has(f.family)) continue;
    try {
      const face = new Face(f.family, bytes(f.woff2), { weight: f.weight, style: 'normal', display: 'swap' });
      doc.fonts.add(face);
      void face.load().catch(() => { /* the fallback stack is used */ });
    } catch {
      /* the fallback stack is used */
    }
  }
}
