/**
 * Token export to Tailwind CSS (v4 @theme & v3 config) and CSS Variables (:root).
 *
 * Transforms captured tokens (colors, typography, spacing, radii, shadows) from
 * individual captures, whole systems, or basket collections into standard,
 * production-ready styling files.
 */
import type {
  Capture,
  CapturedValue,
  CaptureSettings,
  ColorSystem,
  ComponentCapture,
  PageCapture,
  SectionCapture,
  SpacingSystem,
  TextStyle,
  TypographySystem
} from './schema.js';
import { channelColor, formatColor, formatLength, parseColor, pxValue, resolveSettings } from './values.js';
import { cleanSource, sourceText } from './format.js';
import { converter } from 'culori';

/**
 * A page address as it may appear in an exported file: no query or fragment (they can hold tokens,
 * session ids or emails), and nothing that could end the CSS comment it is written in (B-28).
 */
function exportSource(url: string): string {
  let clean: string;
  try { clean = cleanSource(url); } catch { clean = url.split(/[?#]/)[0]!; }
  return clean.replace(/\*\//g, '*\\/').replace(/[\r\n]+/g, ' ');
}

export const CSS_VARS_FILE_NAME = 'tokens.css';
export const TAILWIND_V4_FILE_NAME = 'theme.css';
export const TAILWIND_V3_FILE_NAME = 'tailwind.config.js';

export interface TokenExportOptions {
  name?: string;
  source?: string;
  /** Units, colors and source as the person set them (B-28). */
  settings?: CaptureSettings;
}

export interface ExtractedTokens {
  colors: Map<string, string>;
  fontFamilies: Map<string, string>;
  textStyles: Map<string, { size: string; lineHeight?: string; weight?: string; letterSpacing?: string }>;
  spacing: Map<string, string>;
  radii: Map<string, string>;
  shadows: Map<string, string>;
  sources: Set<string>;
}

const hex = (v: string) => formatColor(v, { colors: 'hex' });
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/^--/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'token';

/** A token's key inside its group, without the group's own prefix: --color-bg gives "bg" (so --color-bg, not --color-color-bg). */
const keyIn = (group: string, hint: string) => {
  const key = slug(hint);
  return key.startsWith(`${group}-`) && key.length > group.length + 1 ? key.slice(group.length + 1) : key;
};

const firstFamily = (v: string) =>
  (v.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');

function freeKey(map: Map<string, unknown>, key: string): string {
  if (!map.has(key)) return key;
  let i = 2;
  while (map.has(`${key}-${i}`)) i++;
  return `${key}-${i}`;
}

const ROLE_KEYS: Readonly<Record<string, string[]>> = {
  accent: ['primary', 'secondary', 'tertiary'],
  background: ['surface', 'surface-variant'],
  text: ['text-primary', 'text-secondary'],
  border: ['border', 'border-variant']
};

/** A number as a CSS name part: "1.6" -> "1-6" (a dot is not allowed in a custom property name) (B-28). */
const numberKey = (n: number) => String(Math.round(n * 100) / 100).replace('.', '-').replace(/^-/, 'neg-');

/** A color worth exporting, as hex: a real color, or bare channels read as one; null for anything else (B-28). */
function exportColor(raw: string): string | null {
  const v = raw.trim();
  const color = parseColor(v) ? v : channelColor(v);
  if (!color) return null;
  const out = hex(color);
  return out && out !== 'transparent' ? out : null;
}

const toOklch = converter('oklch');
/** Colors with at least this much chroma (OKLCH) are accents, as in the capture's color system. */
const ACCENT_CHROMA = 0.06;
const chromatic = (color: string) => { const c = parseColor(color); return Boolean(c && (toOklch(c).c ?? 0) >= ACCENT_CHROMA); };

/** A length worth exporting, in px: null for anything not a px length (a placeholder, a var(), "auto"). */
function exportLength(raw: string): string | null {
  const n = pxValue(raw.trim());
  return n === null ? null : `${Math.round(n * 100) / 100}px`;
}

/** A shadow worth exporting: drawn, and with no placeholder or unresolved variable in it. */
const exportShadow = (raw: string): string | null =>
  raw && raw.trim() !== 'none' && !/\(set on|var\(/.test(raw) ? raw.trim() : null;

type StyleEntry = { property: string; value: CapturedValue };
type TokenEntry = { token: string; value: string; usedFor?: readonly string[] };

export function extractTokens(captures: readonly Capture[]): ExtractedTokens {
  const tokens: ExtractedTokens = {
    colors: new Map(),
    fontFamilies: new Map(),
    textStyles: new Map(),
    spacing: new Map(),
    radii: new Map(),
    shadows: new Map(),
    sources: new Set()
  };
  /** Keys of colors that are accents (a brand color): the first one becomes --color-primary. */
  const accents: string[] = [];

  const addColor = (rawVal: string, keyHint: string, accentRole = false) => {
    const val = exportColor(rawVal);
    if (!val) return;
    // An accent: the role says so, or the color has hue (a brand blue used as a background)
    const accent = accentRole || chromatic(val);
    for (const [k, v] of tokens.colors) {
      if (v.toLowerCase() === val.toLowerCase()) { if (accent && !accents.includes(k)) accents.push(k); return; }
    }
    const k = freeKey(tokens.colors, keyIn('color', keyHint));
    tokens.colors.set(k, val);
    if (accent) accents.push(k);
  };

  const addSpace = (rawVal: string, keyHint?: string) => {
    const val = exportLength(rawVal);
    if (!val || val === '0px') return;
    for (const [, v] of tokens.spacing) {
      if (v === val) return;
    }
    const num = pxValue(val)!;
    const k = keyHint ? keyIn('spacing', keyHint) : numberKey(num);
    tokens.spacing.set(freeKey(tokens.spacing, k), val);
  };

  const addRadius = (rawVal: string, keyHint?: string) => {
    const val = exportLength(rawVal);
    if (!val || val === '0px') return;
    for (const [, v] of tokens.radii) {
      if (v === val) return;
    }
    const num = pxValue(val)!;
    let hint = keyHint ? keyIn('radius', keyHint) : num >= 999 ? 'full' : numberKey(num);
    if (num >= 999) hint = 'full';
    tokens.radii.set(freeKey(tokens.radii, hint), val);
  };

  const addShadow = (rawVal: string, keyHint: string) => {
    const val = exportShadow(rawVal);
    if (!val || [...tokens.shadows.values()].includes(val)) return;
    tokens.shadows.set(freeKey(tokens.shadows, slug(keyHint)), val);
  };

  const addTextStyle = (style: TextStyle, nameHint: string) => {
    const family = firstFamily(style.family.computed);
    if (family && !tokens.fontFamilies.has(slug(family))) {
      tokens.fontFamilies.set(slug(family), style.family.computed);
    }
    const size = exportLength(style.size.computed);
    if (!size) return;
    const key = freeKey(tokens.textStyles, slug(nameHint));
    const letterSpacing = style.letterSpacing.computed !== 'normal' ? exportLength(style.letterSpacing.computed) ?? undefined : undefined;
    tokens.textStyles.set(key, {
      size,
      lineHeight: style.lineHeight.computed !== 'normal' ? exportLength(style.lineHeight.computed) ?? undefined : undefined,
      weight: style.weight.computed,
      ...(letterSpacing ? { letterSpacing } : {})
    });
  };

  /** A color system's roles: accents first as primary, secondary...; then surface, text and border (B-28). */
  const addColorRoles = (roles: readonly { role: string; value: CapturedValue }[]) => {
    const taken: Record<string, number> = {};
    for (const role of ['accent', 'background', 'text', 'border'] as const) {
      for (const r of roles.filter(x => x.role === role)) {
        const i = (taken[role] = (taken[role] ?? 0) + 1);
        const key = r.value.token ? slug(r.value.token) : ROLE_KEYS[role]![i - 1] ?? `${ROLE_KEYS[role]![0]}-${i}`;
        addColor(r.value.computed, key, role === 'accent');
      }
    }
  };

  /** Custom properties a component or section uses, by what they set. */
  const addUsedTokens = (list: readonly TokenEntry[]) => {
    for (const tok of list) {
      const used = tok.usedFor ?? [];
      if (used.some(u => u.includes('color')) || tok.token.includes('color')) addColor(tok.value, tok.token);
      else if (used.some(u => u.includes('radius')) || tok.token.includes('radius')) addRadius(tok.value, tok.token);
      else if (used.some(u => u.includes('shadow')) || tok.token.includes('shadow')) addShadow(tok.value, tok.token);
      else if (used.some(u => u.includes('padding') || u.includes('margin') || u.includes('gap')) || tok.token.includes('spacing') || tok.token.includes('space')) addSpace(tok.value, tok.token);
    }
  };

  /** The colors, radii and shadows of a component's parts or a section's boxes. */
  const addPartStyles = (parts: readonly { part: string; styles: readonly StyleEntry[] }[]) => {
    for (const part of parts) {
      for (const st of part.styles ?? []) {
        if (st.property === 'background-color' || st.property === 'color') addColor(st.value.computed, st.value.token ?? `${part.part}-${st.property.replace('-color', '')}`);
        if (st.property === 'border-radius') addRadius(st.value.computed, st.value.token ?? `${part.part}-radius`);
        if (st.property === 'box-shadow') addShadow(st.value.computed, st.value.token ?? `${part.part}-shadow`);
      }
    }
  };

  const addComponent = (comp: ComponentCapture) => {
    addUsedTokens(comp.tokens ?? []);
    addPartStyles(comp.anatomy ?? []);
  };

  for (const c of captures) {
    if (c.meta?.source) tokens.sources.add(c.meta.source);

    if (c.meta?.scope === 'page') {
      const p = c as PageCapture;
      if (p.color) addColorRoles(p.color.roles);
      if (p.typography) {
        for (const r of p.typography.roles) addTextStyle(r.style, r.role);
      }
      if (p.spacing) {
        for (const s of p.spacing.scale) addSpace(s.value.computed, s.value.token);
      }
      // Its components' colors, radii and shadows, as for a component on its own (B-28)
      for (const comp of p.components ?? []) addComponent(comp);
    } else if (c.meta?.scope === 'section') {
      const s = c as SectionCapture;
      addUsedTokens(s.tokens ?? []);
      addPartStyles(s.structure ?? []);
    } else if (c.meta?.scope === 'system' && 'families' in c) {
      const sys = c as TypographySystem;
      for (const r of sys.roles) addTextStyle(r.style, r.role);
    } else if (c.meta?.scope === 'system' && 'baseUnit' in c) {
      const sys = c as SpacingSystem;
      for (const s of sys.scale) addSpace(s.value.computed, s.value.token);
    } else if (c.meta?.scope === 'system' && 'tokens' in c) {
      addColorRoles((c as ColorSystem).roles);
    } else if (c.meta?.scope === 'component') {
      addComponent(c as ComponentCapture);
    } else if (c.meta?.type === 'color') {
      if ('value' in c && c.value) {
        const role = (c as { role?: string }).role;
        addColor((c.value as CapturedValue).computed, (c.value as CapturedValue).token ?? c.meta.name, role === 'accent');
      } else if ('colors' in c) {
        for (const col of (c as { colors: { value: CapturedValue; role?: string }[] }).colors) {
          addColor(col.value.computed, col.value.token ?? c.meta.name, col.role === 'accent');
        }
      }
    } else if (c.meta?.type === 'text' && 'style' in c) {
      addTextStyle((c as { style: TextStyle }).style, c.meta.name);
    } else if (c.meta?.type === 'spacing') {
      if ('values' in c) {
        for (const v of (c as { values: { value: CapturedValue }[] }).values) {
          addSpace(v.value.computed, v.value.token);
        }
      } else if ('value' in c && c.value) {
        addSpace((c.value as CapturedValue).computed, (c.value as CapturedValue).token ?? c.meta.name);
      }
    }
  }

  // --color-primary is the brand color: the first accent, never just the first color found (a grey
  // star, a page background) (B-28). With no accent, no primary is made up.
  if (!tokens.colors.has('primary') && accents[0]) {
    const key = accents[0];
    const value = tokens.colors.get(key)!;
    tokens.colors.delete(key);
    tokens.colors = new Map([['primary', value], ...tokens.colors]);
  }

  return tokens;
}

/**
 * How values are written in an export, from the capture settings (B-28): colors in the chosen form
 * (hex, rgb, hsl, oklch; all valid CSS), lengths in px or rem ("both" is px: a CSS file holds one
 * value), and each page as its address or, with the "site" setting, the site's name.
 */
function writer(options: TokenExportOptions) {
  const s = resolveSettings(options.settings ?? {});
  const color = (v: string) => formatColor(v, { colors: s.colors });
  const length = (v: string, prop?: string) => formatLength(v, { units: s.units === 'both' ? 'px' : s.units, rootFontSize: s.rootFontSize }, prop);
  const sources = (t: ExtractedTokens) => [...new Set([...t.sources].map(u => exportSource(sourceText(u, s))))];
  return { color, length, sources };
}

/** Format captured design tokens as a pure CSS variables stylesheet (:root). */
export function formatCssVariables(captures: readonly Capture[], options: TokenExportOptions = {}): string {
  const t = extractTokens(captures);
  const w = writer(options);
  const lines: string[] = [];

  lines.push('/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */');
  if (options.name) lines.push(`/* Design System: ${options.name} */`);
  if (t.sources.size) lines.push(`/* Sources: ${w.sources(t).join(', ')} */`);
  lines.push('');
  lines.push(':root {');

  if (t.colors.size) {
    lines.push('  /* Colors */');
    for (const [k, v] of t.colors) lines.push(`  --color-${k}: ${w.color(v)};`);
    lines.push('');
  }

  if (t.fontFamilies.size) {
    lines.push('  /* Font Families */');
    for (const [k, v] of t.fontFamilies) lines.push(`  --font-${k}: ${v};`);
    lines.push('');
  }

  if (t.textStyles.size) {
    lines.push('  /* Typography */');
    for (const [k, v] of t.textStyles) {
      lines.push(`  --text-${k}-size: ${w.length(v.size, 'font-size')};`);
      if (v.lineHeight) lines.push(`  --text-${k}-line-height: ${w.length(v.lineHeight, 'line-height')};`);
      if (v.weight) lines.push(`  --text-${k}-weight: ${v.weight};`);
      if (v.letterSpacing) lines.push(`  --text-${k}-letter-spacing: ${w.length(v.letterSpacing, 'letter-spacing')};`);
    }
    lines.push('');
  }

  if (t.spacing.size) {
    lines.push('  /* Spacing */');
    for (const [k, v] of t.spacing) lines.push(`  --spacing-${k}: ${w.length(v, 'padding')};`);
    lines.push('');
  }

  if (t.radii.size) {
    lines.push('  /* Border Radii */');
    for (const [k, v] of t.radii) lines.push(`  --radius-${k}: ${w.length(v, 'border-radius')};`);
    lines.push('');
  }

  if (t.shadows.size) {
    lines.push('  /* Box Shadows */');
    for (const [k, v] of t.shadows) lines.push(`  --shadow-${k}: ${v};`);
    lines.push('');
  }

  // Remove trailing blank line if present
  if (lines[lines.length - 1] === '') lines.pop();
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Format captured design tokens as a modern Tailwind CSS v4 @theme block. */
export function formatTailwind(captures: readonly Capture[], options: TokenExportOptions = {}): string {
  const t = extractTokens(captures);
  const w = writer(options);
  const lines: string[] = [];

  lines.push('/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */');
  if (options.name) lines.push(`/* Tailwind v4 Theme: ${options.name} */`);
  if (t.sources.size) lines.push(`/* Sources: ${w.sources(t).join(', ')} */`);
  lines.push('');
  lines.push('@theme {');

  for (const [k, v] of t.colors) lines.push(`  --color-${k}: ${w.color(v)};`);
  for (const [k, v] of t.fontFamilies) lines.push(`  --font-${k}: ${v};`);
  for (const [k, v] of t.textStyles) {
    lines.push(`  --text-${k}: ${w.length(v.size, 'font-size')};`);
    if (v.lineHeight) lines.push(`  --text-${k}--line-height: ${w.length(v.lineHeight, 'line-height')};`);
    if (v.weight) lines.push(`  --text-${k}--font-weight: ${v.weight};`);
    if (v.letterSpacing) lines.push(`  --text-${k}--letter-spacing: ${w.length(v.letterSpacing, 'letter-spacing')};`);
  }
  for (const [k, v] of t.spacing) lines.push(`  --spacing-${k}: ${w.length(v, 'padding')};`);
  for (const [k, v] of t.radii) lines.push(`  --radius-${k}: ${w.length(v, 'border-radius')};`);
  for (const [k, v] of t.shadows) lines.push(`  --shadow-${k}: ${v};`);

  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Format captured design tokens as a classic Tailwind CSS v3 configuration file (tailwind.config.js). */
export function formatTailwindV3(captures: readonly Capture[], options: TokenExportOptions = {}): string {
  const t = extractTokens(captures);
  const w = writer(options);

  const colorsObj: Record<string, string> = {};
  for (const [k, v] of t.colors) colorsObj[k] = w.color(v);

  const fontObj: Record<string, string[]> = {};
  for (const [k, v] of t.fontFamilies) {
    fontObj[k] = v.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }

  // Text styles as Tailwind's [size, { lineHeight, fontWeight, letterSpacing }] (B-28)
  const fontSizeObj: Record<string, [string, Record<string, string>]> = {};
  for (const [k, v] of t.textStyles) {
    fontSizeObj[k] = [w.length(v.size, 'font-size'), {
      ...(v.lineHeight ? { lineHeight: w.length(v.lineHeight, 'line-height') } : {}),
      ...(v.weight ? { fontWeight: v.weight } : {}),
      ...(v.letterSpacing ? { letterSpacing: w.length(v.letterSpacing, 'letter-spacing') } : {})
    }];
  }

  const spacingObj: Record<string, string> = {};
  for (const [k, v] of t.spacing) spacingObj[k] = w.length(v, 'padding');

  const radiiObj: Record<string, string> = {};
  for (const [k, v] of t.radii) radiiObj[k] = w.length(v, 'border-radius');

  const shadowsObj: Record<string, string> = {};
  for (const [k, v] of t.shadows) shadowsObj[k] = v;

  const extend: Record<string, unknown> = {};
  if (Object.keys(colorsObj).length) extend.colors = colorsObj;
  if (Object.keys(fontObj).length) extend.fontFamily = fontObj;
  if (Object.keys(fontSizeObj).length) extend.fontSize = fontSizeObj;
  if (Object.keys(spacingObj).length) extend.spacing = spacingObj;
  if (Object.keys(radiiObj).length) extend.borderRadius = radiiObj;
  if (Object.keys(shadowsObj).length) extend.boxShadow = shadowsObj;

  // Two-space JSON, indented to sit under "extend:" (B-28: the old indentation did not line up)
  const extendText = JSON.stringify(extend, null, 2).split('\n').map((line, i) => (i === 0 ? line : `    ${line}`)).join('\n');
  const body = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: ${extendText}
  }
};
`;

  const header = [
    '/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */',
    options.name ? `/* Tailwind v3 Config: ${options.name} */` : null,
    t.sources.size ? `/* Sources: ${w.sources(t).join(', ')} */` : null,
    ''
  ].filter(line => line !== null).join('\n');

  return header + body;
}
