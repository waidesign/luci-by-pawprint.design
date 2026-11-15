/**
 * The project design baseline (B14): the typography, color and spacing systems a project already has,
 * read from its own stylesheets (CSS, plus Sass and Less variables), in Luci's capture format, so agents
 * reuse the project's values and tokens instead of inventing new ones.
 *
 * Every value is authored (method "authored"): what the stylesheets write, resolved through their
 * custom properties (and $ or @ variables), with lengths in px at the stylesheets' root font size.
 * "Uses" counts the declarations that set a value; a token's own definition counts once, so a token
 * defined for a utility framework (Tailwind's @theme) still shows. Pure and browser-safe.
 */
import { findBaseUnit, isMultipleOf } from './spacingUnit.js';
import { formatColor, parseColor } from './values.js';
import type { ColorRole, ColorSystem, SpacingSystem, TextStyle, TypographySystem } from './schema.js';

export interface StylesheetSource {
  /** Path inside the project, for messages ("src/app/globals.css"). */
  file: string;
  text: string;
}

export interface BaselineOptions {
  /** The project's folder name: the files' source is file:///<project>. */
  project: string;
  /** YYYY-MM-DD. */
  captured: string;
}

export interface BaselineToken { token: string; value: string; resolved: string; file: string }

export interface Baseline {
  /** The custom properties the stylesheets define at their root (:root, html, @theme, a theme class). */
  tokens: BaselineToken[];
  typography: TypographySystem | null;
  color: ColorSystem | null;
  spacing: SpacingSystem | null;
  /** The stylesheets read, and the ones that could not be (with why). */
  files: string[];
}

/** The baseline's files in .luci/design/ (one per system). */
export const BASELINE_FILES = {
  typography: 'project.system.typography.design.md',
  color: 'project.system.color.design.md',
  spacing: 'project.system.spacing.design.md'
} as const;

// ---- Parsing ---------------------------------------------------------------------------------------

interface Rule { selector: string; decls: { prop: string; value: string }[]; file: string }

/** Comments out: block comments everywhere, line comments in Sass and Less (not inside url(...)). */
function stripComments(text: string, lineComments: boolean): string {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, '');
  if (lineComments) out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  return out;
}

/** Split at a separator outside parentheses and quotes. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', cur = '';
  for (const c of text) {
    if (quote) { if (c === quote) quote = ''; cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const SKIP_AT_RULES = /^@(keyframes|-webkit-keyframes|font-face|page|counter-style|property|font-feature-values)\b/i;

/**
 * The rules of one stylesheet, nested ones flattened (a Sass "&:hover" keeps its parent's selector),
 * at-rule wrappers (@media, @supports, @layer) passed through, and their variables.
 */
export function parseStylesheet(source: StylesheetSource): { rules: Rule[]; vars: Map<string, string> } {
  const sass = /\.(scss|sass|less)$/i.test(source.file);
  const text = stripComments(source.text, sass);
  const rules: Rule[] = [];
  const vars = new Map<string, string>();
  const walk = (body: string, parent: string | null) => {
    let start = 0, depth = 0, quote = '', head = '';
    // This block's own declarations (the text between its nested blocks)
    const own: string[] = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i]!;
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') {
        if (depth === 0) {
          // Declarations before the nested block stay; the rest is the nested block's head
          const seg = body.slice(start, i);
          const cut = seg.lastIndexOf(';');
          own.push(cut === -1 ? '' : seg.slice(0, cut));
          head = (cut === -1 ? seg : seg.slice(cut + 1)).replace(/\s+/g, ' ').trim();
          start = i + 1;
        }
        depth++;
      } else if (c === '}') {
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
          const inner = body.slice(start, i);
          start = i + 1;
          if (SKIP_AT_RULES.test(head)) continue;
          // @media, @supports, @layer, @container wrap rules; @theme (Tailwind v4) holds tokens like :root
          if (/^@theme\b/i.test(head)) walk(inner, ':root');
          else if (/^@/.test(head)) walk(inner, parent);
          else {
            const selector = parent && !/^:root$/.test(parent)
              ? splitTop(head, ',').map(h => (h.includes('&') ? h.replace(/&/g, parent) : `${parent} ${h.trim()}`)).join(', ')
              : head;
            walk(inner, selector.replace(/\s+/g, ' ').trim());
          }
        }
      }
    }
    own.push(body.slice(start));
    const decls: { prop: string; value: string }[] = [];
    for (const chunk of own) {
      for (const part of splitTop(chunk, ';')) {
        const m = /^\s*([$@]?[-\w]+)\s*:\s*([\s\S]+?)\s*$/.exec(part);
        if (!m || /\{|\}/.test(m[2]!)) continue;
        const prop = m[1]!, value = m[2]!.replace(/\s*!(important|default|global)\b/gi, '').trim();
        if (prop.startsWith('$') || (prop.startsWith('@') && sass)) { if (!vars.has(prop)) vars.set(prop, value); continue; }
        if (prop.startsWith('@')) continue;
        decls.push({ prop: prop.toLowerCase().startsWith('--') ? prop : prop.toLowerCase(), value });
      }
    }
    if (parent && decls.length) rules.push({ selector: parent, decls, file: source.file });
  };
  walk(text, null);
  return { rules, vars };
}

// ---- Resolving -------------------------------------------------------------------------------------

/** Where a project defines its tokens: the root, Tailwind's @theme, or a theme class or attribute on it. */
const ROOT_SELECTOR = /^(:root|html|:host|body|\[data-theme[^\]]*\]|\.(light|dark|theme-[\w-]+))(\s*,\s*(:root|html|:host|body|\[data-theme[^\]]*\]|\.(light|dark|theme-[\w-]+)))*$/i;

function resolver(tokens: Map<string, string>, vars: Map<string, string>) {
  const resolve = (value: string, depth = 0): string => {
    if (depth > 12) return value;
    let out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, name: string, fallback?: string) => {
      const v = tokens.get(name) ?? fallback;
      return v === undefined ? `var(${name})` : resolve(v, depth + 1);
    });
    out = out.replace(/[$@][\w-]+/g, name => (vars.has(name) && !/^@(media|supports|import|include|mixin)$/.test(name) ? resolve(vars.get(name)!, depth + 1) : name));
    return out;
  };
  return resolve;
}

/** The custom property a value is written through, when the whole value is one ("var(--space-4)"). */
const tokenOf = (value: string) => /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(value.trim())?.[1];

/** px for a length ("1.5rem" at a 16px root -> 24); null for anything else. */
function lengthPx(value: string, root: number): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!m[2]) return n === 0 ? 0 : null;
  return m[2] === 'px' ? n : n * root;
}
const pxText = (n: number) => `${Math.round(n * 100) / 100}px`;
const rgb = (value: string) => (parseColor(value) ? formatColor(value, { colors: 'rgb' }) : null);
/** Words of a value at the top level (a shorthand's parts). */
const words = (value: string) => splitTop(value.replace(/\s+/g, ' ').trim(), ' ').map(w => w.trim()).filter(Boolean);

// ---- Building --------------------------------------------------------------------------------------

const ROLE_OF: Readonly<Record<string, ColorRole>> = {
  color: 'text', 'caret-color': 'text', 'text-decoration-color': 'text', '-webkit-text-fill-color': 'text',
  background: 'background', 'background-color': 'background',
  border: 'border', 'border-color': 'border', 'border-top': 'border', 'border-right': 'border', 'border-bottom': 'border', 'border-left': 'border',
  'border-top-color': 'border', 'border-right-color': 'border', 'border-bottom-color': 'border', 'border-left-color': 'border', outline: 'border', 'outline-color': 'border',
  fill: 'accent', stroke: 'accent', 'accent-color': 'accent'
};
/** A token's role from its name, when no declaration uses it (a utility framework's theme). */
const ROLE_BY_NAME: readonly [RegExp, ColorRole][] = [
  [/(^|-)(bg|background|surface|canvas|page|base)(-|$)/, 'background'],
  [/(^|-)(text|foreground|fg|ink|copy)(-|$)/, 'text'],
  [/(^|-)(border|outline|ring|divider|line|stroke)(-|$)/, 'border'],
  [/(^|-)(primary|accent|brand|action|link)(-|$)/, 'accent']
];
const SPACING_PROPS = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap|inset)$/;
const SPACING_TOKEN = /^--(space|spacing|gap|gutter|size)(-|$)/;
const FONT_SIZE_TOKEN = /^--(font-size|text|fs|size-text|typography-size)(-|$)/;
const FONT_FAMILY_TOKEN = /^--(font|font-family|ff)(-|$)/;

/** Element selectors that name a text role: body text, headings, paragraphs, small print, code, controls, links. */
const TEXT_ROLES: readonly [RegExp, string][] = [
  [/^(html|body|:root)$/, 'body'],
  [/^h1$/, 'heading-1'], [/^h2$/, 'heading-2'], [/^h3$/, 'heading-3'], [/^h4$/, 'heading-4'], [/^h5$/, 'heading-5'], [/^h6$/, 'heading-6'],
  [/^p$/, 'paragraph'], [/^small$/, 'small'], [/^(code|pre|kbd|samp)$/, 'code'], [/^button$/, 'button'], [/^label$/, 'label'], [/^a$/, 'link']
];
/** The browser's own sizes and weights for headings, used when the stylesheets set only some of a role. */
const UA_SIZE: Readonly<Record<string, number>> = { 'heading-1': 32, 'heading-2': 24, 'heading-3': 18.72, 'heading-4': 16, 'heading-5': 13.28, 'heading-6': 10.72, small: 13.33, code: 13 };
const UA_BOLD = new Set(['heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5', 'heading-6']);

type Counter<T> = Map<string, { item: T; count: number }>;
const bump = <T>(map: Counter<T>, key: string, item: T, by = 1) => { const e = map.get(key); if (e) e.count += by; else map.set(key, { item, count: by }); };

/** Build the baseline from a project's stylesheets. */
export function buildBaseline(sources: readonly StylesheetSource[], options: BaselineOptions): Baseline {
  const parsed = sources.map(parseStylesheet);
  const rules = parsed.flatMap(p => p.rules);
  const vars = new Map(parsed.flatMap(p => [...p.vars]));
  // Tokens: the first root definition of each custom property
  const defs = new Map<string, { value: string; file: string }>();
  for (const r of rules) {
    if (!ROOT_SELECTOR.test(r.selector)) continue;
    for (const d of r.decls) if (d.prop.startsWith('--') && !defs.has(d.prop)) defs.set(d.prop, { value: d.value, file: r.file });
  }
  const tokenValues = new Map([...defs].map(([k, v]) => [k, v.value]));
  const resolve = resolver(tokenValues, vars);
  const tokens: BaselineToken[] = [...defs].map(([token, d]) => ({ token, value: d.value, resolved: resolve(d.value), file: d.file }));

  // The root font size: html { font-size: 62.5% } makes 1rem 10px
  const htmlSize = rules.filter(r => /^(html|:root)$/.test(r.selector)).flatMap(r => r.decls).find(d => d.prop === 'font-size')?.value;
  const root = htmlSize ? (/%$/.test(htmlSize) ? 16 * parseFloat(htmlSize) / 100 : lengthPx(resolve(htmlSize), 16) ?? 16) : 16;

  const usedTokens = new Map<string, number>();
  const countTokens = (value: string) => { for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) usedTokens.set(m[1]!, (usedTokens.get(m[1]!) ?? 0) + 1); };

  const colors: Counter<{ role: ColorRole; computed: string; authored?: string; token?: string; props: Set<string> }> = new Map();
  const spacing: Counter<{ px: number; computed?: string; authored?: string; token?: string }> = new Map();
  const sizes: Counter<{ px: number; computed?: string; authored?: string; token?: string }> = new Map();
  const families: Counter<string> = new Map();
  const roleStyles = new Map<string, Partial<Record<keyof TextStyle, { computed: string; authored?: string; token?: string }>> & { count: number; elements: Set<string> }>();

  const valueOf = (written: string, computed: string) => ({ computed, ...(written.trim() !== computed ? { authored: written.trim() } : {}), ...(tokenOf(written) ? { token: tokenOf(written)! } : {}) });

  for (const r of rules) {
    for (const d of r.decls) {
      if (d.prop.startsWith('--')) continue;
      countTokens(d.value);
      const resolved = resolve(d.value);
      // Colors, by the role the property gives them
      const role = ROLE_OF[d.prop];
      if (role) {
        const parts = d.prop === 'color' || d.prop.endsWith('-color') || d.prop === 'fill' || d.prop === 'stroke' ? [d.value] : words(d.value);
        for (const written of parts) {
          const computed = rgb(resolve(written));
          if (!computed || computed === 'transparent' || /transparent|currentcolor|inherit/i.test(written)) continue;
          const key = `${role} ${computed}`;
          const e = colors.get(key);
          if (e) { e.count++; e.item.props.add(d.prop); } else colors.set(key, { item: { role, ...valueOf(written, computed), props: new Set([d.prop]) }, count: 1 });
          break;
        }
      }
      // Spacing: every length of a padding, margin, gap or inset
      if (SPACING_PROPS.test(d.prop)) {
        for (const written of words(d.value)) {
          const px = lengthPx(resolve(written), root);
          if (px === null || px <= 0) continue;
          bump(spacing, pxText(px), { px, ...valueOf(written, pxText(px)) });
        }
      }
      if (d.prop === 'font-size') {
        const px = lengthPx(resolved, root);
        if (px !== null && px > 0) bump(sizes, pxText(px), { px, ...valueOf(d.value, pxText(px)) });
      }
      if (d.prop === 'font-family') {
        const first = splitTop(resolved, ',')[0]?.trim().replace(/^["']|["']$/g, '');
        if (first && !/^(inherit|initial|unset)$/i.test(first)) bump(families, first, first);
      }
    }
    // Text roles: element rules only (never classes)
    for (const sel of splitTop(r.selector, ',').map(s => s.trim())) {
      const role = TEXT_ROLES.find(([re]) => re.test(sel))?.[1];
      if (!role) continue;
      const style = roleStyles.get(role) ?? { count: 0, elements: new Set<string>() };
      let touched = false;
      const set = (key: keyof TextStyle, written: string, computed: string) => { style[key] = valueOf(written, computed); touched = true; };
      for (const d of r.decls) {
        const v = resolve(d.value);
        if (d.prop === 'font-family') set('family', d.value, v);
        else if (d.prop === 'font-size') { const px = lengthPx(v, root); if (px !== null) set('size', d.value, pxText(px)); }
        else if (d.prop === 'font-weight') set('weight', d.value, v === 'bold' ? '700' : v === 'normal' ? '400' : v);
        else if (d.prop === 'line-height') { const px = lengthPx(v, root); set('lineHeight', d.value, px !== null && /px|rem|em$/.test(v) ? pxText(px) : v); }
        else if (d.prop === 'letter-spacing') { const px = lengthPx(v, root); set('letterSpacing', d.value, px !== null ? pxText(px) : v); }
        else if (d.prop === 'color') { const c = rgb(v); if (c) set('color', d.value, c); }
        else if (d.prop === 'text-transform') set('transform', d.value, v);
      }
      if (touched) { style.count++; style.elements.add(sel); roleStyles.set(role, style); }
    }
  }

  // Tokens defined but set through utilities (no declaration uses them): their definition counts once
  for (const t of tokens) {
    if ((usedTokens.get(t.token) ?? 0) > 0) continue;
    if (SPACING_TOKEN.test(t.token)) { const px = lengthPx(t.resolved, root); if (px && px > 0) bump(spacing, pxText(px), { px, computed: pxText(px), authored: `var(${t.token})`, token: t.token }); }
    if (FONT_SIZE_TOKEN.test(t.token)) { const px = lengthPx(t.resolved, root); if (px && px > 0) bump(sizes, pxText(px), { px, computed: pxText(px), authored: `var(${t.token})`, token: t.token }); }
    if (FONT_FAMILY_TOKEN.test(t.token) && !parseColor(t.resolved) && lengthPx(t.resolved, root) === null) {
      const first = splitTop(t.resolved, ',')[0]?.trim().replace(/^["']|["']$/g, '');
      if (first && /^[\w\s-]+$/.test(first)) bump(families, first, first);
    }
    const c = rgb(t.resolved);
    const named = ROLE_BY_NAME.find(([re]) => re.test(t.token.slice(2)))?.[1];
    if (c && named && ![...colors.values()].some(e => e.item.token === t.token)) {
      const key = `${named} ${c}`;
      if (!colors.has(key)) colors.set(key, { item: { role: named, computed: c, authored: `var(${t.token})`, token: t.token, props: new Set(['(token)']) }, count: 1 });
    }
  }

  const meta = (type: 'typography' | 'color' | 'spacing') => ({
    name: `project-${type}`, scope: 'system' as const, type, source: `file:///${encodeURIComponent(options.project) || 'project'}`, captured: options.captured, method: 'authored' as const
  });
  const byUses = <T>(map: Counter<T>) => [...map.values()].sort((a, b) => b.count - a.count);

  // Color system: the roles (most used first, at most 6 a role) and every color token
  const colorTokens = tokens.filter(t => rgb(t.resolved)).map(t => ({ token: t.token, value: rgb(t.resolved)!, count: usedTokens.get(t.token) ?? 0 }));
  const colorRoles = (['background', 'text', 'border', 'accent'] as const).flatMap(role =>
    byUses(colors).filter(e => e.item.role === role).slice(0, 6).map(e => ({
      role, value: { computed: e.item.computed, ...(e.item.authored ? { authored: e.item.authored } : {}), ...(e.item.token ? { token: e.item.token } : {}) },
      count: e.count, properties: [...e.item.props]
    })));
  // Only color tokens, none of them used or named for a role: the first stands for the palette, marked as a token
  if (!colorRoles.length && colorTokens[0]) {
    const t = colorTokens[0];
    colorRoles.push({ role: 'accent', value: { computed: t.value, authored: `var(${t.token})`, token: t.token }, count: 1, properties: ['(token)'] });
  }
  const color: ColorSystem | null = colorRoles.length ? { meta: { ...meta('color'), type: 'color' }, roles: colorRoles, tokens: colorTokens } : null;

  // Spacing system: the scale, its base unit and the values off it
  const scale = byUses(spacing).sort((a, b) => a.item.px - b.item.px);
  const baseUnit = findBaseUnit(scale.map(e => ({ px: e.item.px, count: e.count })));
  const strip = (e: { item: { px: number; computed?: string; authored?: string; token?: string }; count: number }) =>
    ({ value: { computed: pxText(e.item.px), ...(e.item.authored ? { authored: e.item.authored } : {}), ...(e.item.token ? { token: e.item.token } : {}) }, count: e.count });
  const spacingSystem: SpacingSystem | null = scale.length ? {
    meta: { ...meta('spacing'), type: 'spacing' },
    scale: scale.map(strip),
    baseUnit,
    outliers: baseUnit ? scale.filter(e => !isMultipleOf(e.item.px, baseUnit.px)).map(strip) : []
  } : null;

  // Typography: each role the element rules style, the rest from body (or the browser's defaults)
  const body = roleStyles.get('body');
  const familyList = byUses(families);
  const fallback = (role: string): TextStyle => ({
    family: body?.family ?? { computed: familyList[0]?.item ?? 'serif' },
    size: role === 'body' ? body?.size ?? { computed: '16px' } : { computed: pxText(UA_SIZE[role] ?? lengthPx(body?.size?.computed ?? '16px', root) ?? 16) },
    weight: UA_BOLD.has(role) ? { computed: '700' } : body?.weight ?? { computed: '400' },
    lineHeight: body?.lineHeight ?? { computed: 'normal' },
    letterSpacing: body?.letterSpacing ?? { computed: 'normal' },
    color: body?.color ?? { computed: 'rgb(0, 0, 0)' }
  });
  const order = TEXT_ROLES.map(([, r]) => r);
  const roles = [...roleStyles].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([role, s]) => {
    const base = fallback(role);
    const style: TextStyle = {
      family: s.family ?? base.family, size: s.size ?? base.size, weight: s.weight ?? base.weight, lineHeight: s.lineHeight ?? base.lineHeight,
      letterSpacing: s.letterSpacing ?? base.letterSpacing, color: s.color ?? base.color, ...(s.transform ? { transform: s.transform } : {})
    };
    return { role, style, count: s.count, elements: [...s.elements] };
  });
  if (!roles.length && (familyList.length || sizes.size)) roles.push({ role: 'body', style: fallback('body'), count: 1, elements: ['body'] });
  const typography: TypographySystem | null = roles.length ? {
    meta: { ...meta('typography'), type: 'typography' },
    roles,
    families: familyList.map(e => ({ family: e.item, count: e.count })),
    scale: byUses(sizes).sort((a, b) => a.item.px - b.item.px).map(e => ({ size: { computed: pxText(e.item.px), ...(e.item.authored ? { authored: e.item.authored } : {}), ...(e.item.token ? { token: e.item.token } : {}) }, count: e.count }))
  } : null;

  return { tokens, typography, color, spacing: spacingSystem, files: sources.map(s => s.file) };
}
