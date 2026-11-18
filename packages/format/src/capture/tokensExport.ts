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
  ColorSystem,
  ComponentCapture,
  PageCapture,
  SectionCapture,
  SpacingSystem,
  TextStyle,
  TypographySystem
} from './schema.js';
import { formatColor, pxValue } from './values.js';

export const CSS_VARS_FILE_NAME = 'tokens.css';
export const TAILWIND_V4_FILE_NAME = 'theme.css';
export const TAILWIND_V3_FILE_NAME = 'tailwind.config.js';

export interface TokenExportOptions {
  name?: string;
  source?: string;
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

const px = (v: string) => {
  const n = pxValue(v);
  return n === null ? v : `${Math.round(n * 100) / 100}px`;
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

  const addColor = (rawVal: string, keyHint: string) => {
    const val = hex(rawVal);
    if (!val || val === 'transparent') return;
    for (const [k, v] of tokens.colors) {
      if (v.toLowerCase() === val.toLowerCase()) return;
    }
    const k = freeKey(tokens.colors, slug(keyHint));
    tokens.colors.set(k, val);
  };

  const addSpace = (rawVal: string, keyHint?: string) => {
    const val = px(rawVal);
    if (!val || val === '0px') return;
    for (const [, v] of tokens.spacing) {
      if (v === val) return;
    }
    const num = pxValue(val);
    const k = keyHint ? slug(keyHint) : num !== null ? String(num) : freeKey(tokens.spacing, 'space');
    tokens.spacing.set(freeKey(tokens.spacing, k), val);
  };

  const addRadius = (rawVal: string, keyHint?: string) => {
    const val = px(rawVal);
    if (!val || val === '0px') return;
    for (const [, v] of tokens.radii) {
      if (v === val) return;
    }
    const num = pxValue(val);
    let hint = keyHint ? slug(keyHint) : num !== null ? `${num}px` : 'radius';
    if (num && num >= 999) hint = 'full';
    tokens.radii.set(freeKey(tokens.radii, hint), val);
  };

  const addTextStyle = (style: TextStyle, nameHint: string) => {
    const family = firstFamily(style.family.computed);
    if (family && !tokens.fontFamilies.has(slug(family))) {
      tokens.fontFamilies.set(slug(family), style.family.computed);
    }
    const key = freeKey(tokens.textStyles, slug(nameHint));
    tokens.textStyles.set(key, {
      size: px(style.size.computed),
      lineHeight: style.lineHeight.computed !== 'normal' ? px(style.lineHeight.computed) : undefined,
      weight: style.weight.computed,
      letterSpacing: style.letterSpacing.computed !== 'normal' ? style.letterSpacing.computed : undefined
    });
  };

  for (const c of captures) {
    if (c.meta?.source) tokens.sources.add(c.meta.source);

    if (c.meta?.scope === 'page') {
      const p = c as PageCapture;
      if (p.color) {
        for (const r of p.color.roles) addColor(r.value.computed, r.value.token ?? r.role);
      }
      if (p.typography) {
        for (const r of p.typography.roles) addTextStyle(r.style, r.role);
      }
      if (p.spacing) {
        for (const s of p.spacing.scale) addSpace(s.value.computed, s.value.token);
      }
      for (const comp of p.components ?? []) {
        for (const tok of comp.tokens ?? []) {
          if (tok.usedFor?.some(u => u.includes('color')) || tok.token.includes('color')) {
            addColor(tok.value, tok.token);
          }
        }
      }
    } else if (c.meta?.scope === 'system' && 'families' in c) {
      const sys = c as TypographySystem;
      for (const r of sys.roles) addTextStyle(r.style, r.role);
    } else if (c.meta?.scope === 'system' && 'baseUnit' in c) {
      const sys = c as SpacingSystem;
      for (const s of sys.scale) addSpace(s.value.computed, s.value.token);
    } else if (c.meta?.scope === 'system' && 'tokens' in c) {
      const sys = c as ColorSystem;
      const taken: Record<string, number> = {};
      for (const role of ['accent', 'background', 'text', 'border'] as const) {
        for (const r of sys.roles.filter(x => x.role === role)) {
          const i = (taken[role] = (taken[role] ?? 0) + 1);
          const key = r.value.token ? slug(r.value.token) : ROLE_KEYS[role]![i - 1] ?? `${ROLE_KEYS[role]![0]}-${i}`;
          addColor(r.value.computed, key);
        }
      }
    } else if (c.meta?.scope === 'component') {
      const comp = c as ComponentCapture;
      for (const tok of comp.tokens ?? []) {
        if (tok.usedFor?.some(u => u.includes('color')) || tok.token.includes('color')) {
          addColor(tok.value, tok.token);
        } else if (tok.usedFor?.some(u => u.includes('radius')) || tok.token.includes('radius')) {
          addRadius(tok.value, tok.token);
        } else if (tok.usedFor?.some(u => u.includes('padding') || u.includes('margin') || u.includes('gap')) || tok.token.includes('spacing') || tok.token.includes('space')) {
          addSpace(tok.value, tok.token);
        }
      }
      for (const part of comp.anatomy ?? []) {
        for (const st of part.styles ?? []) {
          if (st.property === 'background-color' || st.property === 'color') addColor(st.value.computed, st.value.token ?? `${part.part}-${st.property.replace('-color', '')}`);
          if (st.property === 'border-radius') addRadius(st.value.computed, st.value.token ?? `${part.part}-radius`);
          if (st.property === 'box-shadow' && st.value.computed !== 'none') {
            const k = freeKey(tokens.shadows, slug(`${part.part}-shadow`));
            tokens.shadows.set(k, st.value.computed);
          }
        }
      }
    } else if (c.meta?.type === 'color') {
      if ('value' in c && c.value) {
        addColor((c.value as CapturedValue).computed, (c.value as CapturedValue).token ?? c.meta.name);
      } else if ('colors' in c) {
        for (const col of (c as { colors: { value: CapturedValue }[] }).colors) {
          addColor(col.value.computed, col.value.token ?? c.meta.name);
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

  // Ensure default primary exists if any colors were found
  if (tokens.colors.size && !tokens.colors.has('primary')) {
    const firstKey = tokens.colors.keys().next().value;
    if (firstKey) {
      const firstVal = tokens.colors.get(firstKey)!;
      tokens.colors.delete(firstKey);
      tokens.colors = new Map([['primary', firstVal], ...tokens.colors]);
    }
  }

  return tokens;
}

/** Format captured design tokens as a pure CSS variables stylesheet (:root). */
export function formatCssVariables(captures: readonly Capture[], options: TokenExportOptions = {}): string {
  const t = extractTokens(captures);
  const lines: string[] = [];

  lines.push('/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */');
  if (options.name) lines.push(`/* Design System: ${options.name} */`);
  if (t.sources.size) lines.push(`/* Sources: ${Array.from(t.sources).join(', ')} */`);
  lines.push('');
  lines.push(':root {');

  if (t.colors.size) {
    lines.push('  /* Colors */');
    for (const [k, v] of t.colors) {
      lines.push(`  --color-${k}: ${v};`);
    }
    lines.push('');
  }

  if (t.fontFamilies.size) {
    lines.push('  /* Font Families */');
    for (const [k, v] of t.fontFamilies) {
      lines.push(`  --font-${k}: ${v};`);
    }
    lines.push('');
  }

  if (t.textStyles.size) {
    lines.push('  /* Typography */');
    for (const [k, v] of t.textStyles) {
      lines.push(`  --text-${k}-size: ${v.size};`);
      if (v.lineHeight) lines.push(`  --text-${k}-line-height: ${v.lineHeight};`);
      if (v.weight) lines.push(`  --text-${k}-weight: ${v.weight};`);
      if (v.letterSpacing) lines.push(`  --text-${k}-letter-spacing: ${v.letterSpacing};`);
    }
    lines.push('');
  }

  if (t.spacing.size) {
    lines.push('  /* Spacing */');
    for (const [k, v] of t.spacing) {
      lines.push(`  --spacing-${k}: ${v};`);
    }
    lines.push('');
  }

  if (t.radii.size) {
    lines.push('  /* Border Radii */');
    for (const [k, v] of t.radii) {
      lines.push(`  --radius-${k}: ${v};`);
    }
    lines.push('');
  }

  if (t.shadows.size) {
    lines.push('  /* Box Shadows */');
    for (const [k, v] of t.shadows) {
      lines.push(`  --shadow-${k}: ${v};`);
    }
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
  const lines: string[] = [];

  lines.push('/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */');
  if (options.name) lines.push(`/* Tailwind v4 Theme: ${options.name} */`);
  if (t.sources.size) lines.push(`/* Sources: ${Array.from(t.sources).join(', ')} */`);
  lines.push('');
  lines.push('@theme {');

  if (t.colors.size) {
    for (const [k, v] of t.colors) {
      lines.push(`  --color-${k}: ${v};`);
    }
  }

  if (t.fontFamilies.size) {
    for (const [k, v] of t.fontFamilies) {
      lines.push(`  --font-${k}: ${v};`);
    }
  }

  if (t.textStyles.size) {
    for (const [k, v] of t.textStyles) {
      lines.push(`  --text-${k}: ${v.size};`);
      if (v.lineHeight) lines.push(`  --text-${k}--line-height: ${v.lineHeight};`);
      if (v.weight) lines.push(`  --text-${k}--font-weight: ${v.weight};`);
    }
  }

  if (t.spacing.size) {
    for (const [k, v] of t.spacing) {
      lines.push(`  --spacing-${k}: ${v};`);
    }
  }

  if (t.radii.size) {
    for (const [k, v] of t.radii) {
      lines.push(`  --radius-${k}: ${v};`);
    }
  }

  if (t.shadows.size) {
    for (const [k, v] of t.shadows) {
      lines.push(`  --shadow-${k}: ${v};`);
    }
  }

  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Format captured design tokens as a classic Tailwind CSS v3 configuration file (tailwind.config.js). */
export function formatTailwindV3(captures: readonly Capture[], options: TokenExportOptions = {}): string {
  const t = extractTokens(captures);

  const colorsObj: Record<string, string> = {};
  for (const [k, v] of t.colors) colorsObj[k] = v;

  const fontObj: Record<string, string[]> = {};
  for (const [k, v] of t.fontFamilies) {
    fontObj[k] = v.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }

  const spacingObj: Record<string, string> = {};
  for (const [k, v] of t.spacing) spacingObj[k] = v;

  const radiiObj: Record<string, string> = {};
  for (const [k, v] of t.radii) radiiObj[k] = v;

  const shadowsObj: Record<string, string> = {};
  for (const [k, v] of t.shadows) shadowsObj[k] = v;

  const extend: Record<string, unknown> = {};
  if (Object.keys(colorsObj).length) extend.colors = colorsObj;
  if (Object.keys(fontObj).length) extend.fontFamily = fontObj;
  if (Object.keys(spacingObj).length) extend.spacing = spacingObj;
  if (Object.keys(radiiObj).length) extend.borderRadius = radiiObj;
  if (Object.keys(shadowsObj).length) extend.boxShadow = shadowsObj;

  const body = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: ${JSON.stringify(extend, null, 6).replace(/\n\s{4}}/g, '\n    }')}
  }
};
`;

  const header = [
    '/* Generated by Luci (https://github.com/waidesign/luci-by-pawprint.design) */',
    options.name ? `/* Tailwind v3 Config: ${options.name} */` : null,
    t.sources.size ? `/* Sources: ${Array.from(t.sources).join(', ')} */` : null,
    ''
  ].filter(line => line !== null).join('\n');

  return header + body;
}
