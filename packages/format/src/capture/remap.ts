/**
 * Remap to my tokens (v0.4): rewrite a capture onto the person's own design tokens in one step, so
 * they borrow a site's structure and behaviour without its brand. Each value that one of their tokens
 * holds is written through it (`var(--brand)`, Token `--brand`); a value none of them holds keeps its
 * value but loses the site's own token, so the file never names tokens the person's project lacks.
 *
 * Colors match in any notation; lengths match within half a pixel, onto tokens named for what they
 * are (spacing for padding, margin and gap; radius for corners; text sizes for font-size); fonts by
 * their first family; weights, shadows and durations by tokens named for them. Pure and browser-safe.
 */
import { parseStylesheet } from './baseline.js';
import { sameValue } from './check.js';
import { colorKey, parseColor } from './values.js';
import type { Capture, CapturedValue, ComponentCapture, PageCapture, SectionCapture, TextStyle } from './schema.js';

/** One of the person's tokens: its name and its value, resolved through their other tokens. */
export interface MyToken { token: string; value: string }

/**
 * The person's tokens from CSS they paste or their project's stylesheets: every custom property
 * defined anywhere in it (the first definition wins), resolved through the others.
 */
export function parseTokens(css: string): MyToken[] {
  const { rules } = parseStylesheet({ file: 'tokens.css', text: /\{/.test(css) ? css : `:root { ${css} }` });
  const defs = new Map<string, string>();
  for (const r of rules) for (const d of r.decls) if (d.prop.startsWith('--') && !defs.has(d.prop)) defs.set(d.prop, d.value);
  const resolve = (value: string, depth = 0): string => (depth > 12 ? value
    : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, n: string, fb?: string) => {
      const v = defs.get(n) ?? fb;
      return v === undefined ? `var(${n})` : resolve(v, depth + 1);
    }));
  return [...defs].map(([token, value]) => ({ token, value: resolve(value).trim() }));
}

export interface RemapReport {
  /** Values now written through one of the person's tokens ("container background-color"). */
  matched: { what: string; token: string; value: string }[];
  /** Values none of their tokens holds: kept as values, without the site's token. */
  unmatched: { what: string; value: string }[];
}

type Kind = 'color' | 'spacing' | 'radius' | 'font-size' | 'line-height' | 'letter-spacing' | 'border-width' | 'font-family' | 'font-weight' | 'shadow' | 'other';

function kindOf(property: string): Kind {
  if (/(^|-)color$|^(color|background|fill|stroke)$/.test(property)) return 'color';
  if (/^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(-|$)/.test(property)) return 'spacing';
  if (/radius$/.test(property)) return 'radius';
  if (property === 'font-size') return 'font-size';
  if (property === 'line-height') return 'line-height';
  if (property === 'letter-spacing') return 'letter-spacing';
  if (/^(border|outline)(-(top|right|bottom|left))?-width$/.test(property)) return 'border-width';
  if (property === 'font-family') return 'font-family';
  if (property === 'font-weight') return 'font-weight';
  if (property === 'box-shadow' || property === 'text-shadow') return 'shadow';
  return 'other';
}

/** Token names that say what a token is for; a length only maps onto a token named for its kind. */
const NAMED: Readonly<Record<Exclude<Kind, 'color' | 'other'>, RegExp>> = {
  spacing: /(^|-)(space|spacing|gap|gutter|inset|padding|margin|size|s)(-|$)/,
  radius: /(^|-)(radius|radii|rounded|corner|round)(-|$)/,
  'font-size': /(^|-)(font-size|fs|text|size|type|heading|body)(-|$)/,
  'line-height': /(^|-)(leading|line-height|lh)(-|$)/,
  'letter-spacing': /(^|-)(tracking|letter-spacing|ls)(-|$)/,
  'border-width': /(^|-)(border|stroke|outline)(-|$)/,
  'font-family': /(^|-)(font|family|ff|typeface|sans|serif|mono)(-|$)/,
  'font-weight': /(^|-)(weight|fw|font-weight)(-|$)/,
  shadow: /(^|-)(shadow|elevation|depth)(-|$)/
};
/** For colors, a name that suits the role wins over another token with the same value. */
const COLOR_ROLE_NAME: Readonly<Record<string, RegExp>> = {
  text: /(^|-)(text|fg|foreground|ink|copy|content)(-|$)/,
  background: /(^|-)(bg|background|surface|canvas|fill|base)(-|$)/,
  border: /(^|-)(border|outline|stroke|divider|line)(-|$)/
};
const roleOfProperty = (property: string) => (property === 'color' ? 'text' : /^background/.test(property) ? 'background' : /^(border|outline)/.test(property) ? 'border' : 'accent');

const isLength = (v: string) => /^-?\d*\.?\d+(px|rem|em)$/.test(v.trim()) || v.trim() === '0';
const firstFamily = (v: string) => (v.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();

/** The person's token that holds this value for this property, or undefined. */
function findToken(property: string, value: string, tokens: readonly MyToken[], root: number): string | undefined {
  const kind = kindOf(property);
  if (kind === 'other') return undefined;
  const name = (t: MyToken) => t.token.slice(2).toLowerCase();
  if (kind === 'color') {
    const key = colorKey(value);
    if (!key) return undefined;
    const hits = tokens.filter(t => parseColor(t.value) && colorKey(t.value) === key);
    const role = COLOR_ROLE_NAME[roleOfProperty(property)];
    return ((role ? hits.find(t => role.test(name(t))) : undefined) ?? hits[0])?.token;
  }
  const named = tokens.filter(t => NAMED[kind].test(name(t)));
  if (kind === 'font-family') return named.find(t => firstFamily(t.value) === firstFamily(value))?.token;
  if (kind === 'font-weight' || kind === 'shadow') return named.find(t => t.value.replace(/\s+/g, ' ').trim() === value.replace(/\s+/g, ' ').trim())?.token;
  if (!isLength(value)) return undefined;
  return named.find(t => isLength(t.value) && sameValue(property, t.value, value, { rootFontSize: root }))?.token;
}

/** Remap a capture onto the person's tokens. The capture given is not changed. */
export function remapCapture<T extends Capture>(capture: T, tokens: readonly MyToken[], options: { rootFontSize?: number } = {}): { capture: T; report: RemapReport } {
  const root = options.rootFontSize ?? 16;
  const c = JSON.parse(JSON.stringify(capture)) as T;
  const report: RemapReport = { matched: [], unmatched: [] };
  const used = new Map<string, { value: string; usedFor: Set<string> }>();

  /** One value, rewritten in place. Shorthands ("12px 20px") map word by word. */
  const visit = (v: CapturedValue | undefined, property: string, what: string, usedFor = what) => {
    if (!v) return;
    const words = v.computed.trim().split(/\s+/);
    const multi = words.length > 1 && kindOf(property) !== 'shadow' && kindOf(property) !== 'font-family' && words.every(w => isLength(w));
    const tokensFor = multi ? words.map(w => (parseFloat(w) === 0 ? null : findToken(property, w, tokens, root))) : [findToken(property, v.computed, tokens, root)];
    if (tokensFor.some(Boolean)) {
      const authored = multi ? words.map((w, i) => (tokensFor[i] ? `var(${tokensFor[i]})` : w)).join(' ') : `var(${tokensFor[0]})`;
      delete v.token;
      v.authored = authored;
      if (!multi) v.token = tokensFor[0]!;
      for (const t of tokensFor) {
        if (!t) continue;
        const e = used.get(t) ?? { value: tokens.find(x => x.token === t)!.value, usedFor: new Set<string>() };
        e.usedFor.add(usedFor);
        used.set(t, e);
      }
      report.matched.push({ what, token: tokensFor.filter(Boolean).join(' '), value: v.computed });
      return;
    }
    // No token of theirs holds it: the value stays, the site's token goes
    if (v.token || v.authored?.includes('var(')) report.unmatched.push({ what, value: v.computed });
    else if (kindOf(property) !== 'other') report.unmatched.push({ what, value: v.computed });
    delete v.token;
    if (v.authored?.includes('var(')) delete v.authored;
  };
  const textStyle = (s: TextStyle, prefix: string) => {
    visit(s.family, 'font-family', `${prefix}font-family`); visit(s.size, 'font-size', `${prefix}font-size`); visit(s.weight, 'font-weight', `${prefix}font-weight`);
    visit(s.lineHeight, 'line-height', `${prefix}line-height`); visit(s.letterSpacing, 'letter-spacing', `${prefix}letter-spacing`); visit(s.color, 'color', `${prefix}color`);
  };
  const component = (k: ComponentCapture, prefix = '') => {
    for (const p of k.anatomy) for (const s of p.styles) visit(s.value, s.property, `${prefix}${p.part} ${s.property}`, `${prefix}${p.part}`);
    for (const st of k.states) for (const ch of st.changes) visit(ch.to, ch.property, `${prefix}${st.state}: ${ch.part ?? 'container'} ${ch.property}`, `${prefix}${ch.part ?? 'container'}`);
    for (const v of k.variants ?? []) for (const d of v.differences) visit(d.value, d.property, `${prefix}variant ${v.name} ${d.property}`, `${prefix}variant ${v.name}`);
    k.tokens = [];
  };
  const tokensList = () => [...used].map(([token, e]) => ({ token, value: e.value, usedFor: [...e.usedFor] }));

  const m = c.meta;
  if (m.scope === 'component') {
    component(c as ComponentCapture);
    (c as ComponentCapture).tokens = tokensList();
  } else if (m.scope === 'section') {
    const s = c as SectionCapture;
    for (const p of s.structure) for (const st of p.styles) visit(st.value, st.property, `${p.part} ${st.property}`, p.part);
    s.tokens = tokensList();
  } else if (m.scope === 'page') {
    const p = c as PageCapture;
    for (const k of p.components) { used.clear(); component(k, `${k.meta.name}: `); k.tokens = tokensList(); }
    used.clear();
    for (const sys of [p.typography, p.color, p.spacing]) if (sys) remapSystemInPlace(sys);
  } else if (m.scope === 'system') remapSystemInPlace(c);
  else if (m.type === 'text' && 'style' in c) textStyle(c.style, '');
  else if (m.type === 'color' && 'value' in c && !('kind' in c)) visit(c.value, 'color', 'color');
  else if (m.type === 'spacing' && 'values' in c) for (const v of c.values) visit(v.value, v.property, v.property);
  else if (m.type === 'spacing' && 'kind' in c) visit(c.value, c.property ?? c.kind, c.property ?? c.kind);

  function remapSystemInPlace(sys: Capture) {
    if (sys.meta.scope !== 'system') return;
    if ('families' in sys) {
      for (const r of sys.roles) textStyle(r.style, `${r.role} `);
      for (const s of sys.scale) visit(s.size, 'font-size', `scale ${s.size.computed}`);
    } else if ('baseUnit' in sys) {
      for (const s of sys.scale) visit(s.value, 'padding', `scale ${s.value.computed}`);
      for (const o of sys.outliers) visit(o.value, 'padding', `outlier ${o.value.computed}`);
    } else if ('roles' in sys && 'tokens' in sys) {
      for (const r of sys.roles) visit(r.value, r.role === 'text' ? 'color' : r.role === 'border' ? 'border-color' : 'background-color', `${r.role} ${r.value.computed}`);
      // The color system's tokens become the person's own color tokens
      sys.tokens = tokens.filter(t => parseColor(t.value)).map(t => ({ token: t.token, value: t.value, count: report.matched.filter(x => x.token.split(' ').includes(t.token)).length }));
    }
  }
  return { capture: c, report };
}

/** One line on what a remap did: "14 of 18 values now use your tokens." */
export function remapSummary(report: RemapReport): string {
  const total = report.matched.length + report.unmatched.length;
  if (!total) return 'This capture has no values your tokens could hold.';
  return `${report.matched.length} of ${total} value${total === 1 ? '' : 's'} now use${report.matched.length === 1 ? 's' : ''} your tokens.${report.unmatched.length ? ` ${report.unmatched.length} ${report.unmatched.length === 1 ? 'has' : 'have'} no token of yours: ${report.unmatched.slice(0, 4).map(u => `${u.what} ${u.value}`).join(', ')}${report.unmatched.length > 4 ? ', ...' : ''}.` : ''}`;
}
