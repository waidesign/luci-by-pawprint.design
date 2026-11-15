/**
 * DESIGN.md for Google Stitch (and other prose-first DESIGN.md workflows): captures exported in the
 * open DESIGN.md format (google-labs-code/design.md, Apache-2.0, version "alpha"): YAML front matter
 * with design tokens (colors, typography, rounded, spacing, components, with "{colors.primary}"
 * references and "-hover" variants), then the spec's sections in its order: Overview, Colors,
 * Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts (a section with nothing
 * measured for it is left out, as the spec allows).
 *
 * Every sentence is filled in from measured values by fixed templates: no AI writes any of it, and
 * nothing is invented; a value Luci did not measure is not there. Export only: Luci's own tables stay
 * the format the project keeps (the design check and the agent's tools read those). Pure and browser-safe.
 */
import { formatColor, pxValue } from './values.js';
import type {
  Capture, CapturedValue, ColorSystem, ComponentCapture, PageCapture, SectionCapture, SpacingSystem, TextStyle, TypographySystem
} from './schema.js';

export const STITCH_FILE_NAME = 'DESIGN.md';
/** The DESIGN.md format version Luci writes. */
export const STITCH_VERSION = 'alpha';

type Tokens = {
  colors: Map<string, string>;
  typography: Map<string, Record<string, string>>;
  rounded: Map<string, string>;
  spacing: Map<string, string>;
  components: Map<string, Record<string, string>>;
};

const hex = (v: string) => formatColor(v, { colors: 'hex' });
const slug = (text: string) => text.toLowerCase().replace(/^--/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'token';
const title = (text: string) => text.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const firstFamily = (v: string) => (v.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
const px = (v: string) => { const n = pxValue(v); return n === null ? v : `${Math.round(n * 100) / 100}px`; };
/** letter-spacing in em when it came from em, else px; "normal" is left out. */
const tracking = (v: CapturedValue) => (v.computed === 'normal' ? undefined : v.authored && /em$/.test(v.authored) && !/rem$/.test(v.authored) ? v.authored : px(v.computed));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A key not taken yet: "primary", "primary-2". */
function freeKey(map: Map<string, unknown>, key: string): string {
  if (!map.has(key)) return key;
  let i = 2;
  while (map.has(`${key}-${i}`)) i++;
  return `${key}-${i}`;
}

/** The color's key: an existing one with the same value, or a new key. */
function colorRef(t: Tokens, value: string, key: string): string {
  const h = hex(value);
  for (const [k, v] of t.colors) if (v === h) return k;
  const k = freeKey(t.colors, key);
  t.colors.set(k, h);
  return k;
}

function textStyleTokens(s: TextStyle): Record<string, string> {
  const out: Record<string, string> = { fontFamily: firstFamily(s.family.computed), fontSize: px(s.size.computed), fontWeight: s.weight.computed };
  if (s.lineHeight.computed !== 'normal') out['lineHeight'] = /px$/.test(s.lineHeight.computed) ? px(s.lineHeight.computed) : s.lineHeight.computed;
  const ls = tracking(s.letterSpacing);
  if (ls) out['letterSpacing'] = ls;
  return out;
}

/** Facts gathered from the captures for the prose. */
interface Facts {
  sources: Set<string>;
  notes: { what: string; text: string }[];
  colors: { key: string; value: string; role: string; uses?: number; token?: string | undefined; properties: string[] }[];
  type: { key: string; style: TextStyle; elements: string[] }[];
  spacing: { base: number | null; values: string[]; outliers: string[] };
  radii: Map<string, Set<string>>;
  shadows: { what: string; value: string }[];
  components: ComponentCapture[];
  sections: SectionCapture[];
  donts: string[];
  dos: string[];
  estimated: boolean;
}

const ROLE_KEYS: Readonly<Record<string, string[]>> = {
  accent: ['primary', 'secondary', 'tertiary'],
  background: ['surface', 'surface-variant'],
  text: ['on-surface', 'on-surface-variant'],
  border: ['outline', 'outline-variant']
};

function addColorSystem(t: Tokens, f: Facts, c: ColorSystem) {
  const taken: Record<string, number> = {};
  // The accents first, so the most used one is "primary" (the spec's one required color)
  for (const role of ['accent', 'background', 'text', 'border'] as const) {
    for (const r of c.roles.filter(x => x.role === role)) {
      const i = taken[role] = (taken[role] ?? 0) + 1;
      const key = ROLE_KEYS[role]![i - 1] ?? `${ROLE_KEYS[role]![0]}-${i}`;
      const k = colorRef(t, r.value.computed, key);
      if (!f.colors.some(x => x.key === k)) f.colors.push({ key: k, value: hex(r.value.computed), role, uses: r.count, token: r.value.token, properties: r.properties });
    }
  }
}

function addTypography(t: Tokens, f: Facts, c: TypographySystem) {
  for (const r of c.roles) {
    const key = freeKey(t.typography, slug(r.role));
    t.typography.set(key, textStyleTokens(r.style));
    f.type.push({ key, style: r.style, elements: r.elements });
  }
}

function addSpacing(t: Tokens, f: Facts, c: SpacingSystem) {
  if (c.baseUnit) { t.spacing.set('unit', `${c.baseUnit.px}px`); f.spacing.base = c.baseUnit.px; }
  for (const s of c.scale) addSpace(t, f, s.value.token ? slug(s.value.token) : `space-${px(s.value.computed)}`, s.value.computed);
  f.spacing.outliers.push(...c.outliers.map(o => px(o.value.computed)));
}

/** A spacing value, once: a value already in the scale keeps its first key. */
function addSpace(t: Tokens, f: Facts, name: string, value: string) {
  const v = px(value);
  if (!f.spacing.values.includes(v)) f.spacing.values.push(v);
  if ([...t.spacing].some(([k, x]) => x === v && k !== 'unit')) return;
  t.spacing.set(freeKey(t.spacing, name), v);
}

const STATE_SUFFIX: Readonly<Record<string, string>> = { hover: 'hover', active: 'active', 'focus-visible': 'focus', focus: 'focus', disabled: 'disabled' };

function addComponent(t: Tokens, f: Facts, c: ComponentCapture) {
  const name = freeKey(t.components, slug(c.meta.name));
  const container = c.anatomy[0]!;
  const style = (part: { styles: { property: string; value: CapturedValue }[] }, p: string) => part.styles.find(s => s.property === p)?.value;
  const label = c.anatomy.find(p => style(p, 'font-size'));
  const props: Record<string, string> = {};
  const bg = style(container, 'background-color');
  if (bg && hex(bg.computed) !== 'transparent') props['backgroundColor'] = `{colors.${colorRef(t, bg.computed, bg.token ? slug(bg.token) : `${name}-background`)}}`;
  const fg = (label && style(label, 'color')) ?? style(container, 'color');
  if (fg) props['textColor'] = `{colors.${colorRef(t, fg.computed, fg.token ? slug(fg.token) : `${name}-text`)}}`;
  if (label) {
    const s = (p: string) => style(label, p);
    const family = s('font-family'), size = s('font-size');
    if (family && size) {
      const key = freeKey(t.typography, `${name}-label`);
      t.typography.set(key, textStyleTokens({ family, size, weight: s('font-weight') ?? { computed: '400' }, lineHeight: s('line-height') ?? { computed: 'normal' }, letterSpacing: s('letter-spacing') ?? { computed: 'normal' }, color: fg ?? { computed: 'rgb(0, 0, 0)' } }));
      props['typography'] = `{typography.${key}}`;
    }
  }
  const radius = style(container, 'border-radius');
  if (radius && px(radius.computed) !== '0px') {
    let key = [...t.rounded].find(([, v]) => v === px(radius.computed))?.[0];
    if (!key) { key = freeKey(t.rounded, radius.token ? slug(radius.token).replace(/^radius-/, '') : `r-${px(radius.computed).replace('px', '')}`); t.rounded.set(key, px(radius.computed)); }
    props['rounded'] = `{rounded.${key}}`;
    const where = f.radii.get(px(radius.computed)) ?? new Set<string>();
    where.add(c.meta.name);
    f.radii.set(px(radius.computed), where);
  }
  for (const [p, k] of [['padding', 'padding'], ['height', 'height'], ['width', 'width']] as const) {
    const v = style(container, p);
    if (v && !/auto/.test(v.computed) && (p === 'padding' || !/%/.test(v.computed))) props[k] = v.computed.split(/\s+/).map(px).join(' ');
  }
  t.components.set(name, props);
  // State variants ("button-primary-hover"), with what changes there
  for (const st of c.states.filter(s => s.detected && s.changes.length)) {
    const v: Record<string, string> = {};
    for (const ch of st.changes) {
      if (ch.property === 'background-color' && (ch.part ?? 'container') === 'container') v['backgroundColor'] = `{colors.${colorRef(t, ch.to.computed, `${name}-${STATE_SUFFIX[st.state]}`)}}`;
      if (ch.property === 'color') v['textColor'] = `{colors.${colorRef(t, ch.to.computed, `${name}-${STATE_SUFFIX[st.state]}-text`)}}`;
    }
    if (Object.keys(v).length) t.components.set(freeKey(t.components, `${name}-${STATE_SUFFIX[st.state]}`), v);
  }
  const shadow = style(container, 'box-shadow');
  if (shadow && shadow.computed !== 'none') f.shadows.push({ what: c.meta.name, value: shadow.computed });
  // Accessibility as do's and don'ts, from what was measured
  for (const x of c.accessibility?.contrast ?? []) {
    if (x.level === 'fail') f.donts.push(`Don't put ${hex(x.text)} text on ${hex(x.background)} as in ${title(c.meta.name)}: its contrast is ${x.ratio}:1, under the 4.5:1 AA needs.`);
  }
  if (c.accessibility?.target && c.accessibility.target.level === 'fail') f.donts.push(`Don't make ${title(c.meta.name)} smaller than 24 by 24px to click (it measured ${c.accessibility.target.width} by ${c.accessibility.target.height}px).`);
  if (c.accessibility?.focus?.visible) f.dos.push(`Do keep focus visible on ${title(c.meta.name)}: it changes ${c.accessibility.focus.by.join(', ')} on ${c.accessibility.focus.state ?? 'focus'}.`);
  if (c.accessibility?.focus?.visible === false) f.donts.push(`Don't leave ${title(c.meta.name)} without a visible focus state: nothing changes when it is focused.`);
  f.components.push(c);
}

function gather(captures: readonly Capture[]): { t: Tokens; f: Facts } {
  const t: Tokens = { colors: new Map(), typography: new Map(), rounded: new Map(), spacing: new Map(), components: new Map() };
  const f: Facts = { sources: new Set(), notes: [], colors: [], type: [], spacing: { base: null, values: [], outliers: [] }, radii: new Map(), shadows: [], components: [], sections: [], donts: [], dos: [], estimated: false };
  const one = (c: Capture) => {
    // Origin and path only, as every capture writes it (a query or fragment can carry personal data)
    let source = c.meta.source;
    try { const u = new URL(source); source = u.origin === 'null' ? `${u.protocol}//${u.host}${u.pathname}` : `${u.origin}${u.pathname}`; } catch { /* a site name */ }
    f.sources.add(source);
    if (c.meta.method === 'estimated') f.estimated = true;
    if (c.instructions) f.notes.push({ what: title(c.meta.name), text: c.instructions });
    const m = c.meta;
    if (m.scope === 'page') {
      const p = c as PageCapture;
      if (p.color) addColorSystem(t, f, p.color);
      if (p.typography) addTypography(t, f, p.typography);
      if (p.spacing) addSpacing(t, f, p.spacing);
      for (const k of p.components) addComponent(t, f, k);
    } else if (m.scope === 'system' && 'families' in c) addTypography(t, f, c as TypographySystem);
    else if (m.scope === 'system' && 'baseUnit' in c) addSpacing(t, f, c as SpacingSystem);
    else if (m.scope === 'system' && 'tokens' in c) addColorSystem(t, f, c as ColorSystem);
    else if (m.scope === 'component') addComponent(t, f, c as ComponentCapture);
    else if (m.scope === 'section') f.sections.push(c as SectionCapture);
    else if (m.type === 'color' && 'value' in c && !('kind' in c)) {
      const key = colorRef(t, c.value.computed, c.value.token ? slug(c.value.token) : slug(m.name));
      if (!f.colors.some(x => x.key === key)) f.colors.push({ key, value: hex(c.value.computed), role: c.role ?? 'color', token: c.value.token, properties: c.usedFor.map(u => u.property) });
    } else if (m.type === 'text' && 'style' in c) {
      const key = freeKey(t.typography, slug(m.name.replace(/^text-/, '')));
      t.typography.set(key, textStyleTokens(c.style));
      f.type.push({ key, style: c.style, elements: [c.usedBy.element] });
    } else if (m.type === 'spacing' && 'values' in c) {
      for (const v of c.values) addSpace(t, f, v.value.token ? slug(v.value.token) : `space-${px(v.value.computed)}`, v.value.computed);
    } else if (m.type === 'spacing' && 'kind' in c) {
      addSpace(t, f, c.value.token ? slug(c.value.token) : slug(m.name), c.value.computed);
    }
  };
  for (const c of captures) one(c);
  // The spec's one required color: primary. Without an accent, the first color found stands for it
  if (t.colors.size && !t.colors.has('primary')) {
    const [k, v] = [...t.colors][0]!;
    t.colors.delete(k);
    t.colors = new Map([['primary', v], ...t.colors]);
    for (const tokens of t.components.values()) for (const [p, ref] of Object.entries(tokens)) if (ref === `{colors.${k}}`) tokens[p] = '{colors.primary}';
    for (const x of f.colors) if (x.key === k) x.key = 'primary';
  }
  return { t, f };
}

// ---- YAML -------------------------------------------------------------------------------------------

/** A YAML scalar: plain when safe, double-quoted otherwise (colors, references, numbers kept as text). */
const scalar = (v: string) => ((/^[A-Za-z][\w .-]*$/.test(v) && !/^(true|false|null|yes|no|on|off)$/i.test(v)) || /^-?\d*\.?\d+(px|em|rem)$/.test(v) ? v : JSON.stringify(v));
const key = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));

function frontMatter(name: string, description: string, t: Tokens): string[] {
  const out = ['---', `version: ${STITCH_VERSION}`, `name: ${scalar(name)}`, `description: ${JSON.stringify(description)}`];
  const flat = (label: string, map: Map<string, string>) => { if (map.size) out.push(`${label}:`, ...[...map].map(([k, v]) => `  ${key(k)}: ${scalar(v)}`)); };
  const nested = (label: string, map: Map<string, Record<string, string>>) => {
    if (!map.size) return;
    out.push(`${label}:`);
    for (const [k, props] of map) out.push(`  ${key(k)}:`, ...Object.entries(props).map(([p, v]) => `    ${p}: ${scalar(v)}`));
  };
  flat('colors', t.colors);
  nested('typography', t.typography);
  flat('rounded', t.rounded);
  flat('spacing', t.spacing);
  nested('components', t.components);
  out.push('---');
  return out;
}

// ---- Prose -------------------------------------------------------------------------------------------

const ROLE_WORDS: Readonly<Record<string, string>> = { accent: 'an accent', background: 'a background', text: 'a text color', border: 'a border and outline color', color: 'a color' };

function styleSentence(s: TextStyle): string {
  const parts = [`${firstFamily(s.family.computed)} ${px(s.size.computed)}`, `weight ${s.weight.computed}`];
  if (s.lineHeight.computed !== 'normal') parts.push(`line height ${/px$/.test(s.lineHeight.computed) ? px(s.lineHeight.computed) : s.lineHeight.computed}`);
  const ls = tracking(s.letterSpacing);
  if (ls) parts.push(`letter spacing ${ls}`);
  if (s.transform && s.transform.computed !== 'none') parts.push(s.transform.computed);
  return parts.join(', ');
}

function componentProse(c: ComponentCapture): string[] {
  const container = c.anatomy[0]!;
  const v = (p: string, part = container) => part.styles.find(s => s.property === p)?.value;
  const facts: string[] = [];
  const bg = v('background-color');
  if (bg && hex(bg.computed) !== 'transparent') facts.push(`a ${hex(bg.computed)} background`);
  const label = c.anatomy.find(p => v('font-size', p));
  const fg = (label && v('color', label)) ?? v('color');
  if (fg) facts.push(`${hex(fg.computed)} text`);
  const radius = v('border-radius');
  if (radius && px(radius.computed) !== '0px') facts.push(`${px(radius.computed)} corners`);
  const padding = v('padding');
  if (padding) facts.push(`${padding.computed.split(/\s+/).map(px).join(' ')} padding`);
  const border = v('border');
  if (border && !/^0px|none/.test(border.computed)) facts.push(`a ${border.computed} border`);
  const lines = [`A ${c.meta.type} (${container.element})${facts.length ? ` with ${facts.join(', ')}` : ''}.${label && v('font-family', label) && v('font-size', label) ? ` Its label is ${firstFamily(v('font-family', label)!.computed)} ${px(v('font-size', label)!.computed)}${v('font-weight', label) ? `, weight ${v('font-weight', label)!.computed}` : ''}.` : ''}`];
  if (c.anatomy.length > 1) lines.push(`Parts: ${c.anatomy.map(p => `${p.part} (${p.element})${p.optional ? ', optional' : ''}`).join('; ')}.`);
  const states = c.states.filter(s => s.detected && s.changes.length);
  if (states.length) lines.push(...states.map(s => `On ${s.state}, ${s.changes.map(ch => `${ch.part && ch.part !== 'container' ? `the ${ch.part}'s ` : ''}${ch.property} becomes ${/color/.test(ch.property) ? hex(ch.to.computed) : ch.to.computed}`).join('; ')}.`));
  if (c.motion.length) lines.push(`Motion: ${c.motion.map(m => `${m.kind} of ${m.target}, ${m.duration} ${m.easing}`).join('; ')}.`);
  if (c.images?.length) lines.push(`Image slots: ${c.images.map(i => `${i.part}, ${i.aspectRatio}`).join('; ')}.`);
  return [`### ${title(c.meta.name)}`, lines.join(' ')];
}

export interface StitchOptions {
  /** The design system's name (front matter `name`). Default: from the first capture's site. */
  name?: string;
}

/** Captures (one, or a basket) as one DESIGN.md in the open DESIGN.md format. */
export function formatStitch(captures: readonly Capture[], options: StitchOptions = {}): string {
  const { t, f } = gather(captures);
  const site = (() => { try { const u = new URL([...f.sources][0] ?? ''); return u.host.replace(/^www\./, '') || decodeURIComponent(u.pathname.replace(/^\//, '')); } catch { return ''; } })();
  const name = options.name ?? (site ? `${title(site.split('.')[0]!.replace(/:\d+$/, ''))} design` : 'Design');
  const method = captures.every(c => c.meta.method === 'authored') ? 'read from the project\'s own stylesheets' : f.estimated ? 'measured from live pages, and estimated where marked' : 'measured from live pages';
  const description = `Exported by Luci from ${plural(captures.length, 'capture')} of ${[...f.sources].map(s => s.replace(/^https?:\/\//, '')).join(', ')}; values ${method}.`;
  const out = [...frontMatter(name, description, t), '', `# ${name}`, ''];

  // Overview: what this is built from, and the person's own notes, word for word
  out.push('## Overview', `This design system is ${method}: ${[...f.sources].join(', ')}. Every value below is one Luci found there, and the words are filled in from those values; nothing is invented.${f.estimated ? ' Values from an image are estimates.' : ''}`);
  if (f.notes.length) out.push('', 'Notes from the person who captured it:', ...f.notes.map(n => `- ${n.what}: ${n.text.replace(/\s*\n\s*/g, ' ')}`));

  if (f.colors.length || t.colors.size) {
    out.push('', '## Colors');
    const described = new Set(f.colors.map(c => c.key));
    for (const c of f.colors) {
      out.push(`- **${title(c.key)} (${t.colors.get(c.key) ?? c.value}):** ${ROLE_WORDS[c.role] ?? 'a color'}${c.uses ? `, used ${plural(c.uses, 'time')}` : ''}${c.properties.length && c.properties[0] !== 'image' ? ` for ${[...new Set(c.properties)].join(', ')}` : ''}${c.token ? `; the site writes it as ${c.token}` : ''}.`);
    }
    for (const [k, v] of t.colors) if (!described.has(k)) out.push(`- **${title(k)} (${v}):** used by ${k.replace(/-(background|text|hover|active|focus|disabled)(-text)?$/, '')}.`);
  }

  if (t.typography.size) {
    out.push('', '## Typography');
    for (const x of f.type) out.push(`- **${title(x.key)}:** ${styleSentence(x.style)}${x.elements.length ? `; used by ${x.elements.join(', ')}` : ''}.`);
    const families = [...new Set([...t.typography.values()].map(v => v['fontFamily']).filter(Boolean))];
    if (families.length) out.push('', `Type families: ${families.join(', ')}.`);
  }

  const layout: string[] = [];
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => (pxValue(a) ?? 0) - (pxValue(b) ?? 0)).join(', ');
  if (f.spacing.base) layout.push(`- Spacing follows a ${f.spacing.base}px base unit: ${sorted(f.spacing.values)}.`);
  else if (f.spacing.values.length) layout.push(`- Spacing values: ${sorted(f.spacing.values)}.`);
  if (f.spacing.outliers.length) layout.push(`- Off the base unit: ${sorted(f.spacing.outliers)}.`);
  for (const s of f.sections) {
    const root = s.structure[0]!;
    const st = (p: string) => root.styles.find(x => x.property === p)?.value.computed;
    const display = st('display');
    const cols = st('grid-template-columns');
    layout.push(`- ${title(s.meta.name)}: a ${s.meta.type} (${root.element})${display ? `, ${display}${display === 'grid' && cols ? ` of ${cols.split(' ').length} columns` : ''}` : ''}${st('gap') ? `, gap ${px(st('gap')!)}` : ''}${st('padding') ? `, padding ${st('padding')!.split(/\s+/).map(px).join(' ')}` : ''}; it holds ${s.components.map(k => `${k.count > 1 ? `${k.count} ` : ''}${k.name}`).join(', ') || 'no components'}.`);
  }
  if (layout.length) out.push('', '## Layout', ...layout);

  if (f.shadows.length) out.push('', '## Elevation & Depth', ...f.shadows.map(s => `- ${title(s.what)}: box-shadow ${s.value}.`));

  if (t.rounded.size) out.push('', '## Shapes', ...[...t.rounded].map(([k, v]) => `- **${title(k)} (${v}):** ${f.radii.get(v) ? `corners of ${[...f.radii.get(v)!].map(title).join(', ')}` : 'a corner radius'}.`));

  if (f.components.length) out.push('', '## Components', ...f.components.flatMap(c => ['', ...componentProse(c)]));

  const rules = [
    ...(t.colors.size ? ['- Do build with the colors above, through their tokens; don\'t add new ones without a reason.'] : []),
    ...(f.spacing.base ? [`- Do keep spacing to multiples of ${f.spacing.base}px.`] : []),
    ...f.dos.map(d => `- ${d}`),
    ...f.donts.map(d => `- ${d}`)
  ];
  if (rules.length) out.push('', '## Do\'s and Don\'ts', ...rules);
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}
