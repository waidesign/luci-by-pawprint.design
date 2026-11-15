/**
 * Font Identification (v0.5, PRD Roadmap Priority 12):
 * Identifies the exact rendered font family from the computed font stack via document.fonts.check(),
 * recognizes Google Fonts families, and produces import URLs for coding agents.
 */
import type { FontIdentification } from '@luci-dev/format/capture';

export const POPULAR_GOOGLE_FONTS = new Set([
  'inter', 'roboto', 'open sans', 'montserrat', 'poppins', 'lato', 'oswald', 'raleway',
  'nunito', 'rubik', 'ubuntu', 'playfair display', 'merriweather', 'fira sans', 'work sans',
  'dm sans', 'plus jakarta sans', 'geist', 'geist mono', 'jetbrains mono', 'fira code',
  'inconsolata', 'source code pro', 'space grotesk', 'syne', 'outfit', 'manrope', 'sora',
  'lexend', 'figtree', 'albert sans', 'urbanist', 'cabin', 'cormorant garamond', 'cinzel',
  'archivo', 'barlow', 'karla', 'epilogue', 'quicksand', 'lora', 'pt sans', 'pt serif',
  'noto sans', 'noto serif', 'source sans 3', 'source sans pro', 'libre baskerville',
  'space mono', 'crimson text', 'bitter', 'cabin', 'hind', 'titillium web', 'mukta'
]);

export const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont', 'segoe ui'
]);

/** Check whether a family is hosted by Google Fonts. */
export function isGoogleFont(family: string, doc?: Document): boolean {
  const norm = family.trim().toLowerCase().replace(/^["']|["']$/g, '');
  if (POPULAR_GOOGLE_FONTS.has(norm)) return true;

  // Inspect page link tags for Google Fonts stylesheets
  if (doc) {
    const links = doc.querySelectorAll('link[href*="fonts.googleapis.com"]');
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href') ?? '';
      try {
        const url = new URL(href, 'https://fonts.googleapis.com');
        const familyParam = url.searchParams.get('family');
        if (familyParam && familyParam.toLowerCase().includes(norm)) return true;
      } catch {
        if (href.toLowerCase().includes(norm.replace(/\s+/g, '+'))) return true;
      }
    }
  }
  return false;
}

/** Construct Google Fonts CSS2 import URL for a font family. */
export function googleFontUrl(family: string): string {
  const clean = family.trim().replace(/^["']|["']$/g, '');
  const encoded = encodeURIComponent(clean).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
}

/**
 * Identify the exact rendered font family from a CSS font-family stack.
 * Uses document.fonts.check() when available in the browser; falls back to the first non-generic candidate.
 */
export function identifyFont(fontFamily: string, win?: Window): FontIdentification {
  const rawList = (fontFamily || '').split(/,(?![^(]*\))/).map(f => f.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (!rawList.length) return { rendered: 'sans-serif' };

  let rendered = rawList[0]!;

  const doc = win?.document ?? (typeof document !== 'undefined' ? document : undefined);
  const fontSet = (doc as Document & { fonts?: FontFaceSet })?.fonts;

  if (fontSet && typeof fontSet.check === 'function') {
    for (const candidate of rawList) {
      const lower = candidate.toLowerCase();
      // Skip generic keywords for explicit loaded check
      if (GENERIC_FAMILIES.has(lower)) continue;
      try {
        if (fontSet.check(`16px "${candidate}"`)) {
          rendered = candidate;
          break;
        }
      } catch {
        // Continue checking next candidate
      }
    }
  }

  // If the chosen candidate is a generic fallback, pick the first specific named font if present
  if (GENERIC_FAMILIES.has(rendered.toLowerCase())) {
    const specific = rawList.find(f => !GENERIC_FAMILIES.has(f.toLowerCase()));
    if (specific) rendered = specific;
  }

  const google = isGoogleFont(rendered, doc);
  return {
    rendered,
    ...(google ? { googleFont: true, importUrl: googleFontUrl(rendered) } : {})
  };
}
