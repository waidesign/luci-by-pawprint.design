/**
 * Compare mode (v0.4): two captures side by side (two sites' buttons, two pages' type scales) and
 * every value that differs, in plain rows: what, A, B. Values are compared by meaning, the way the
 * design check compares them (colors in any notation, lengths within half a pixel, rem at the root
 * size). Component files compare from their text (readComponentFile and the check's own rules);
 * captures in the toolbar compare from their values, at any scope. Pure and browser-safe.
 */
import { fail, ok, type ParseResult } from '../result.js';
import { checkComponent, sameValue } from './check.js';
import { readComponentFile } from './read.js';
import type { Capture, CapturedValue, ComponentCapture, PageCapture, SectionCapture, TextStyle } from './schema.js';

export interface CompareRow {
  /** What is compared: "container padding-top", "hover: label color", "heading-1 size". */
  what: string;
  /** As each side has it ("not set" when it has none). */
  a: string;
  b: string;
}

/** One side of a comparison. `note` is the person's own note on that capture, on one line ("dark mode"). */
export interface CompareSide { name: string; type: string; source: string; note?: string }

export interface CompareResult {
  a: CompareSide;
  b: CompareSide;
  /** Everything compared that is the same on both. */
  same: string[];
  differences: CompareRow[];
}

const NONE = 'not set';
const shown = (v: { value: string; token?: string | undefined }) => (v.token ? `${v.value} (${v.token})` : v.value);

/** Who a side is, with the person's note when there is one: the note is often what tells A and B apart (light and dark mode). */
function side(meta: { name: string; type: string; source: string }, instructions: string | undefined): CompareSide {
  const note = instructions?.replace(/\s+/g, ' ').trim();
  return { name: meta.name, type: meta.type, source: meta.source, ...(note ? { note } : {}) };
}

/** Two component files (as saved), compared part by part: parts, styles, states, motion and accessibility. */
export function compareComponentFiles(a: string, b: string): ParseResult<CompareResult> {
  const left = readComponentFile(a);
  if (!left.ok) return fail(`The first file is not a component capture: ${left.error}`);
  const right = readComponentFile(b);
  if (!right.ok) return fail(`The second file is not a component capture: ${right.error}`);
  const check = checkComponent(left.value, right.value);
  return ok({
    a: side(left.value.meta, left.value.instructions),
    b: side(right.value.meta, right.value.instructions),
    same: check.matches,
    differences: check.differences.map(d => ({
      what: `${d.state ? `${d.state}: ` : ''}${d.kind === 'part' ? `part ${d.part}` : `${d.part} ${d.property}`}`,
      a: d.expected === 'none' || d.expected === 'no change' ? (d.kind === 'part' ? 'none' : d.expected) : d.expected,
      b: d.actual
    }))
  });
}

/** One capture's values as rows: what -> value (with its token) and the property that says how to compare it. */
type Flat = Map<string, { value: string; token?: string | undefined; property: string }>;

const put = (out: Flat, what: string, property: string, v: CapturedValue | undefined) => {
  if (v) out.set(what, { value: v.computed, ...(v.token ? { token: v.token } : {}), property });
};
type TextPropertyKey = 'family' | 'size' | 'weight' | 'lineHeight' | 'letterSpacing' | 'color' | 'style' | 'transform' | 'decoration';
const TEXT_FIELDS: readonly [TextPropertyKey, string][] = [
  ['family', 'font-family'], ['size', 'font-size'], ['weight', 'font-weight'], ['lineHeight', 'line-height'], ['letterSpacing', 'letter-spacing'],
  ['color', 'color'], ['style', 'font-style'], ['transform', 'text-transform'], ['decoration', 'text-decoration']
];
const textStyle = (out: Flat, prefix: string, s: TextStyle) => { for (const [k, p] of TEXT_FIELDS) put(out, `${prefix}${p}`, p, s[k]); };

function component(out: Flat, c: ComponentCapture, prefix = '') {
  for (const p of c.anatomy) {
    out.set(`${prefix}part ${p.part}`, { value: p.element, property: 'part' });
    for (const s of p.styles) put(out, `${prefix}${p.part} ${s.property}`, s.property, s.value);
  }
  for (const st of c.states) {
    for (const ch of st.changes) put(out, `${prefix}${st.state}: ${ch.part ?? 'container'} ${ch.property}`, ch.property, ch.to);
  }
  for (const m of c.motion) {
    out.set(`${prefix}${m.part ?? 'container'} ${m.kind} ${m.target}`, { value: `${m.duration} ${m.easing}${m.delay ? ` ${m.delay}` : ''}`, property: 'transition' });
  }
  for (const x of c.accessibility?.contrast ?? []) out.set(`${prefix}${x.part ?? 'container'} text contrast`, { value: `${x.ratio}:1 (${x.level})`, property: 'contrast' });
  if (c.accessibility?.target) out.set(`${prefix}target size`, { value: `${c.accessibility.target.width}x${c.accessibility.target.height}px (${c.accessibility.target.level})`, property: 'target' });
}

function section(out: Flat, c: SectionCapture) {
  for (const s of c.structure) {
    out.set(`part ${s.part}`, { value: s.component ? `${s.element}, component ${s.component.name}${s.count ? ` x${s.count}` : ''}` : s.element, property: 'part' });
    for (const st of s.styles) put(out, `${s.part} ${st.property}`, st.property, st.value);
  }
}

function system(out: Flat, c: Capture, prefix = '') {
  const m = c.meta;
  if (m.scope === 'system' && m.type === 'typography' && 'families' in c) {
    for (const r of c.roles) textStyle(out, `${prefix}${r.role} `, r.style);
    out.set(`${prefix}font sizes`, { value: c.scale.map(s => s.size.computed).join(', '), property: 'list' });
  } else if (m.scope === 'system' && m.type === 'color' && 'tokens' in c && 'roles' in c) {
    for (const role of ['background', 'text', 'border', 'accent'] as const) {
      const values = (c.roles as { role: string; value: CapturedValue }[]).filter(r => r.role === role).map(r => r.value.computed);
      if (values.length) out.set(`${prefix}${role} colors`, { value: values.join(', '), property: 'list' });
    }
  } else if (m.scope === 'system' && m.type === 'spacing' && 'baseUnit' in c) {
    out.set(`${prefix}spacing scale`, { value: c.scale.map(s => s.value.computed).join(', '), property: 'list' });
    out.set(`${prefix}base unit`, { value: c.baseUnit ? `${c.baseUnit.px}px` : 'none', property: 'length' });
  }
}

/** A capture's values, flat. */
export function flattenCapture(c: Capture): Flat {
  const out: Flat = new Map();
  const m = c.meta;
  if (m.scope === 'component') component(out, c as ComponentCapture);
  else if (m.scope === 'section') section(out, c as SectionCapture);
  else if (m.scope === 'page') {
    const p = c as PageCapture;
    for (const s of [p.typography, p.color, p.spacing]) if (s) system(out, s);
    for (const k of p.components) component(out, k, `${k.meta.name}: `);
  } else if (m.scope === 'system') system(out, c);
  else if (m.type === 'text' && 'style' in c) textStyle(out, '', c.style);
  else if (m.type === 'color' && 'value' in c) put(out, 'color', 'color', c.value);
  else if (m.type === 'color' && 'colors' in c) for (const col of (c as { colors: { role?: string; value: { computed: string } }[] }).colors) put(out, col.role ?? 'color', col.role ?? 'color', col.value);
  else if (m.type === 'spacing' && 'values' in c) for (const v of c.values) put(out, v.property, v.property, v.value);
  else if (m.type === 'spacing' && 'kind' in c) put(out, c.property ?? c.kind, c.property ?? 'padding', c.value);
  return out;
}

/** Same values, comparing lists item by item. */
function same(property: string, a: string, b: string): boolean {
  if (property === 'list') {
    const x = a.split(', '), y = b.split(', ');
    return x.length === y.length && x.every((v, i) => sameValue(/^(rgb|#|hsl|oklch)/.test(v) ? 'color' : 'width', v, y[i]!));
  }
  if (property === 'part' || property === 'contrast' || property === 'target' || property === 'transition') return a === b;
  return sameValue(property, a, b);
}

/** Two captures from the toolbar (any scope), value by value. */
export function compareCaptures(a: Capture, b: Capture): CompareResult {
  const fa = flattenCapture(a), fb = flattenCapture(b);
  const out: CompareResult = {
    a: side(a.meta, a.instructions),
    b: side(b.meta, b.instructions),
    same: [],
    differences: []
  };
  for (const what of new Set([...fa.keys(), ...fb.keys()])) {
    const x = fa.get(what), y = fb.get(what);
    if (x && y && same(x.property, x.value, y.value)) { out.same.push(what); continue; }
    out.differences.push({ what, a: x ? shown(x) : NONE, b: y ? shown(y) : NONE });
  }
  return out;
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

/** The comparison as Markdown: what was compared, how many values are the same, and a table of the differences. */
export function formatCompareReport(result: CompareResult, names: { a: string; b: string } = { a: result.a.name, b: result.b.name }): string {
  const d = result.differences;
  const out = [
    `# Compare: ${names.a} and ${names.b}`,
    `- A: ${result.a.name} (${result.a.type}), from ${result.a.source}${result.a.note ? `. Your note: ${result.a.note}` : ''}`,
    `- B: ${result.b.name} (${result.b.type}), from ${result.b.source}${result.b.note ? `. Your note: ${result.b.note}` : ''}`,
    `- ${result.same.length} value${result.same.length === 1 ? ' is' : 's are'} the same; ${d.length} differ${d.length === 1 ? 's' : ''}.`
  ];
  if (d.length) {
    out.push('', '| What | A | B |', '| --- | --- | --- |', ...d.map(r => `| ${cell(r.what)} | ${cell(r.a)} | ${cell(r.b)} |`));
  } else {
    out.push('', 'No differences: every value compared is the same.');
  }
  return `${out.join('\n')}\n`;
}
