/**
 * The design check (v0.3): a built component compared with its design file, part by part. Both are
 * component files read with readComponentFile, so the same formatter wrote both sides; values are
 * compared by meaning, not text: lengths in px within half a pixel (rem at the root font size),
 * colors by colorKey (any notation), times in ms, functions argument by argument. Each difference
 * is one sentence a person can pin on the element as a feedback note. Pure and browser-safe.
 */
import { z } from 'zod';
import { colorKey } from './values.js';
import type { ComponentSpec, SpecChange, SpecCheck, SpecMotion, SpecPart, SpecState, ComponentStateName } from './read.js';

export const CHECK_KINDS = ['style', 'token', 'part', 'state', 'motion', 'accessibility'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export interface CheckDifference {
  kind: CheckKind;
  /** The part, named as the design file names it ("container", "label", "icon"). */
  part: string;
  /** For a state's change: the state. */
  state?: ComponentStateName;
  /** The CSS property; for motion "transition background-color"; for accessibility the check ("text contrast"). */
  property: string;
  /** As the design file writes it (with its token), or "not set" / "no change" / "none". */
  expected: string;
  /** As the built component's file writes it. */
  actual: string;
  /** The note, as a person would write it on the element. */
  comment: string;
  /** Accessibility that got worse: high; a value that differs: medium; something extra, or a token not used: low. */
  priority: 'high' | 'medium' | 'low';
}

export interface CheckResult {
  /** The design's name and source, as its file says. */
  design: { name: string; type: string; source: string };
  /** Every value compared that matched ("container background-color", "hover: container background-color"). */
  matches: string[];
  differences: CheckDifference[];
}

export interface CheckOptions {
  /** Half a pixel by default: a rendered 12.4px is the design's 12px. */
  tolerancePx?: number;
  /** For rem values (a file written with the rem setting). Default 16. */
  rootFontSize?: number;
  /**
   * Custom properties the built page defines. When the design sets a value through one of them and
   * the built component gets the same value without it, the check says to use the token.
   */
  knownTokens?: readonly string[];
  /** When true, accessibility levels are compared strictly symmetrically (for compareComponentFiles). */
  symmetricAccessibility?: boolean;
}

/** Tokens of a value at the top level: words and commas, with function calls kept whole. */
function tokens(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (const c of text.trim()) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(c)) { flush(); continue; }
    if (depth === 0 && c === ',') { flush(); out.push(','); continue; }
    cur += c;
  }
  flush();
  return out;
}

type Num = { n: number; kind: 'length' | 'em' | 'time' | 'angle' | 'percent' | 'viewport' | 'number'; unit?: string };
function numberOf(token: string, root: number): Num | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em|ms|s|deg|%|dvw|dvh|svw|svh|lvw|lvh|vw|vh)?$/.exec(token);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'px': return { n, kind: 'length' };
    case 'rem': return { n: n * root, kind: 'length' };
    case 'em': return { n, kind: 'em' };
    case 'ms': return { n, kind: 'time' };
    case 's': return { n: n * 1000, kind: 'time' };
    case 'deg': return { n, kind: 'angle' };
    case '%': return { n, kind: 'percent' };
    case 'vw': case 'vh': case 'dvw': case 'dvh': case 'svw': case 'svh': case 'lvw': case 'lvh':
      return { n, kind: 'viewport', unit: m[2] };
    default: return { n, kind: 'number' };
  }
}

const FUNCTION = /^([a-zA-Z-]+)\((.*)\)$/;
/** Color functions are compared as colors, not argument by argument. */
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;

function sameToken(a: string, b: string, o: Required<Pick<CheckOptions, 'tolerancePx' | 'rootFontSize'>>): boolean {
  if (a === b) return true;
  const x = numberOf(a, o.rootFontSize);
  const y = numberOf(b, o.rootFontSize);
  if (x && y) {
    // A bare 0 is a length of 0
    const kx = x.kind === 'number' && x.n === 0 ? y.kind : x.kind;
    const ky = y.kind === 'number' && y.n === 0 ? x.kind : y.kind;
    if (kx !== ky) return false;
    if (kx === 'viewport' && x.unit !== y.unit) return false;
    const tolerance = kx === 'length' ? o.tolerancePx : kx === 'em' ? 0.01 : kx === 'time' ? 0.5 : 0.01;
    return Math.abs(x.n - y.n) <= tolerance;
  }
  const fa = FUNCTION.exec(a);
  const fb = FUNCTION.exec(b);
  if (fa && fb && !COLOR_FUNCTION.test(fa[1]!) && !COLOR_FUNCTION.test(fb[1]!)) {
    return fa[1]!.toLowerCase() === fb[1]!.toLowerCase() && sameList(tokens(fa[2]!), tokens(fb[2]!), o);
  }
  const ca = colorKey(a);
  const cb = colorKey(b);
  if (ca && cb) return ca === cb;
  const plain = (t: string) => t.replace(/^["']|["']$/g, '').toLowerCase();
  return plain(a) === plain(b);
}

const sameList = (a: string[], b: string[], o: Required<Pick<CheckOptions, 'tolerancePx' | 'rootFontSize'>>) =>
  a.length === b.length && a.every((t, i) => sameToken(t, b[i]!, o));

function parseShadowLayers(layerTokens: string[], rootFontSize: number) {
  const groups: string[][] = [[]];
  for (const t of layerTokens) {
    if (t === ',') groups.push([]);
    else groups[groups.length - 1]!.push(t);
  }
  return groups.filter(g => g.length > 0).map(group => {
    let inset = false;
    let color = '';
    const lengths: number[] = [];
    for (const token of group) {
      if (token.toLowerCase() === 'inset') {
        inset = true;
        continue;
      }
      const ck = colorKey(token);
      if (ck) {
        color = ck;
        continue;
      }
      const num = numberOf(token, rootFontSize);
      if (num && (num.kind === 'length' || (num.kind === 'number' && num.n === 0))) {
        lengths.push(num.n);
        continue;
      }
      color = token.toLowerCase();
    }
    while (lengths.length < 4) lengths.push(0);
    return { inset, color, lengths };
  });
}

function sameShadow(a: string, b: string, o: Required<Pick<CheckOptions, 'tolerancePx' | 'rootFontSize'>>): boolean {
  if (a.trim() === b.trim()) return true;
  if (a.trim() === 'none' || b.trim() === 'none') return a.trim() === b.trim();
  const aLayers = parseShadowLayers(tokens(a), o.rootFontSize);
  const bLayers = parseShadowLayers(tokens(b), o.rootFontSize);
  if (aLayers.length !== bLayers.length) return false;
  return aLayers.every((al, i) => {
    const bl = bLayers[i]!;
    if (al.inset !== bl.inset) return false;
    if (al.color !== bl.color && !sameToken(al.color, bl.color, o)) return false;
    return al.lengths.every((len, li) => Math.abs(len - bl.lengths[li]!) <= o.tolerancePx);
  });
}

/** The first font in a family list, as people name it: "Inter" for `"Inter", system-ui, sans-serif`. */
const firstFamily = (value: string) => (value.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();

/** Do two written values mean the same? Font families compare by their first font. */
export function sameValue(property: string, a: string, b: string, options: CheckOptions = {}): boolean {
  const o = { tolerancePx: options.tolerancePx ?? 0.5, rootFontSize: options.rootFontSize ?? 16 };
  if (property === 'font-family') return firstFamily(a) === firstFamily(b);
  if (property === 'box-shadow') return sameShadow(a, b, o);
  return sameList(tokens(a), tokens(b), o);
}

const withToken = (value: string, token?: string) => (token ? `${value} (${token})` : value);
/** "its background-color" for the container (the note sits on it), "the label's color" for a part. */
const subject = (part: string, property: string) => (part === 'container' ? `its ${property}` : `the ${part}'s ${property}`);
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function compareStyles(design: SpecPart, built: SpecPart, o: CheckOptions, out: CheckResult): void {
  const known = new Set(o.knownTokens ?? []);
  for (const want of design.styles) {
    const have = built.styles.find(s => s.property === want.property);
    const label = `${design.part} ${want.property}`;
    if (!have) {
      out.differences.push({
        kind: 'style', part: design.part, property: want.property, expected: withToken(want.value, want.token), actual: 'not set',
        comment: `${capital(subject(design.part, want.property))} is not set; the design says ${withToken(want.value, want.token)}.`, priority: 'medium'
      });
      continue;
    }
    if (!sameValue(want.property, want.value, have.value, o)) {
      out.differences.push({
        kind: 'style', part: design.part, property: want.property, expected: withToken(want.value, want.token), actual: withToken(have.value, have.token),
        comment: `${capital(subject(design.part, want.property))} is ${withToken(have.value, have.token)}; the design says ${withToken(want.value, want.token)}.`, priority: 'medium'
      });
      continue;
    }
    // The same value, but hard-coded where the design uses a token this page defines too
    if (want.token && have.token !== want.token && known.has(want.token)) {
      out.differences.push({
        kind: 'token', part: design.part, property: want.property, expected: withToken(want.value, want.token), actual: withToken(have.value, have.token),
        comment: `${capital(subject(design.part, want.property))} is ${withToken(have.value, have.token)}, the right value; the design sets it with ${want.token}, which this page defines too: use var(${want.token}).`, priority: 'low'
      });
      continue;
    }
    out.matches.push(label);
  }
  for (const extra of built.styles.filter(s => !design.styles.some(d => d.property === s.property))) {
    out.differences.push({
      kind: 'style', part: design.part, property: extra.property, expected: 'not set', actual: withToken(extra.value, extra.token),
      comment: `${capital(subject(design.part, extra.property))} is ${withToken(extra.value, extra.token)}; the design does not set it.`, priority: 'low'
    });
  }
}

const changeKey = (c: SpecChange) => `${c.part} ${c.property}`;
const changeText = (c: SpecChange) => withToken(c.to, c.token);

function compareState(want: SpecState, have: SpecState | undefined, parts: ReadonlySet<string>, o: CheckOptions, out: CheckResult): void {
  // Luci could not tell what the design does in this state: nothing to compare
  if (want.status === 'unknown') return;
  const haveChanges = have?.status === 'changes' ? have.changes : [];
  const unsure = !have || have.status === 'unknown'
    ? ` Luci found no ${want.state} change in the built one's stylesheets; if it changes through JavaScript, check it by hand.`
    : '';
  for (const c of want.changes) {
    const got = haveChanges.find(h => changeKey(h) === changeKey(c));
    if (got && sameValue(c.property, c.to, got.to, o)) { out.matches.push(`${want.state}: ${changeKey(c)}`); continue; }
    out.differences.push({
      kind: 'state', part: c.part, state: want.state, property: c.property, expected: changeText(c), actual: got ? changeText(got) : 'no change',
      comment: got
        ? `On ${want.state}, ${subject(c.part, c.property)} changes to ${changeText(got)}; the design says ${changeText(c)}.`
        : `On ${want.state}, ${subject(c.part, c.property)} does not change; the design changes it to ${changeText(c)}.${unsure}`,
      priority: 'medium'
    });
  }
  // Changes the design does not make, on parts both have
  for (const h of haveChanges) {
    if (!parts.has(h.part) || want.changes.some(c => changeKey(c) === changeKey(h))) continue;
    out.differences.push({
      kind: 'state', part: h.part, state: want.state, property: h.property, expected: 'no change', actual: changeText(h),
      comment: `On ${want.state}, ${subject(h.part, h.property)} changes to ${changeText(h)}; in the design it does not change.`, priority: 'low'
    });
  }
}

const motionKey = (m: SpecMotion) => `${m.part} ${m.kind} ${m.target}`;
const motionText = (m: SpecMotion) => `${m.duration} ${m.easing}${m.delay ? `, delay ${m.delay}` : ''}`;
const motionSubject = (m: SpecMotion) => subject(m.part, m.kind === 'transition' ? `transition of ${m.target}` : `animation ${m.target}`);
const motionOwner = (m: SpecMotion) => (m.part === 'container' ? 'it has' : `the ${m.part} has`);

function compareMotion(design: SpecMotion[], built: SpecMotion[], parts: ReadonlySet<string>, o: CheckOptions, out: CheckResult): void {
  for (const m of design) {
    if (!parts.has(m.part)) continue;
    // "all" covers any one property
    const got = built.find(b => motionKey(b) === motionKey(m)) ?? built.find(b => b.part === m.part && b.kind === 'transition' && b.target === 'all' && m.kind === 'transition');
    const property = `${m.kind} ${m.target}`;
    if (!got) {
      out.differences.push({
        kind: 'motion', part: m.part, property, expected: motionText(m), actual: 'none',
        comment: `${capital(motionOwner(m))} no ${m.kind === 'transition' ? `transition of ${m.target}` : `animation ${m.target}`}; the design has ${motionText(m)}.`, priority: 'medium'
      });
      continue;
    }
    const same = sameValue('duration', m.duration, got.duration, o) && sameValue('easing', m.easing, got.easing, o) && sameValue('delay', m.delay ?? '0s', got.delay ?? '0s', o);
    if (same) { out.matches.push(`${m.part} ${property}`); continue; }
    out.differences.push({
      kind: 'motion', part: m.part, property, expected: motionText(m), actual: motionText(got),
      comment: `${capital(motionSubject(m))} is ${motionText(got)}; the design has ${motionText(m)}.`, priority: 'medium'
    });
  }
  for (const b of built) {
    if (!parts.has(b.part) || design.some(m => motionKey(m) === motionKey(b)) || (b.target === 'all' && design.some(m => m.part === b.part && m.kind === 'transition'))) continue;
    out.differences.push({
      kind: 'motion', part: b.part, property: `${b.kind} ${b.target}`, expected: 'none', actual: motionText(b),
      comment: `${capital(motionSubject(b))} is ${motionText(b)}; the design has none.`, priority: 'low'
    });
  }
}

const RANK: Readonly<Record<SpecCheck['level'], number>> = { AAA: 3, AA: 2, yes: 2, fail: 1, no: 1, unknown: 0 };
const CHECK_NAMES: Readonly<Record<SpecCheck['check'], string>> = { contrast: 'text contrast', target: 'target size', focus: 'focus visible' };
const levelText = (c: SpecCheck) => `${c.measured} (${c.level === 'fail' ? 'fails AA' : c.level === 'yes' ? 'visible' : c.level === 'no' ? 'not visible' : c.level})`;

/** One accessibility check that got worse, as a sentence. */
function accessibilityComment(want: SpecCheck, got: SpecCheck): string {
  if (want.check === 'focus') return `Focus does not show: ${got.measured}. In the design it does (${want.measured}).`;
  const name = subject(want.part, CHECK_NAMES[want.check]);
  return `${capital(name)} is ${levelText(got)}; the design's is ${levelText(want)}.`;
}

function compareAccessibility(design: SpecCheck[], built: SpecCheck[], out: CheckResult, symmetric = false): void {
  for (const want of design) {
    const got = built.find(b => b.check === want.check && b.part === want.part);
    if (!got || !RANK[want.level] || !RANK[got.level]) continue;
    const name = CHECK_NAMES[want.check];
    if (symmetric ? (RANK[got.level] === RANK[want.level]) : (RANK[got.level] >= RANK[want.level])) { out.matches.push(`${want.part} ${name}`); continue; }
    out.differences.push({
      kind: 'accessibility', part: want.part, property: name, expected: levelText(want), actual: levelText(got),
      comment: accessibilityComment(want, got), priority: 'high'
    });
  }
}

/** Compare a built component (its file, read) with its design file (read). */
export function checkComponent(design: ComponentSpec, built: ComponentSpec, options: CheckOptions = {}): CheckResult {
  const out: CheckResult = { design: { name: design.meta.name, type: design.meta.type, source: design.meta.source }, matches: [], differences: [] };
  const builtParts = new Map(built.parts.map(p => [p.part, p]));
  const both = new Set<string>();
  for (const want of design.parts) {
    const have = builtParts.get(want.part);
    if (!have) {
      out.differences.push({
        kind: 'part', part: want.part, property: 'part', expected: want.element, actual: 'none',
        comment: `The design has ${article(want.part)} ${want.part} (${want.element})${want.optional ? ', optional' : ''}; the built one has none.`, priority: want.optional ? 'low' : 'medium'
      });
      continue;
    }
    both.add(want.part);
    compareStyles(want, have, options, out);
  }
  for (const extra of built.parts.filter(p => !design.parts.some(d => d.part === p.part))) {
    out.differences.push({
      kind: 'part', part: extra.part, property: 'part', expected: 'none', actual: extra.element,
      comment: `The built one has ${article(extra.part)} ${extra.part} (${extra.element}) that the design does not have.`, priority: 'low'
    });
  }
  for (const want of design.states) compareState(want, built.states.find(s => s.state === want.state), both, options, out);
  compareMotion(design.motion, built.motion, both, options, out);
  compareAccessibility(design.accessibility, built.accessibility, out, options.symmetricAccessibility);
  return out;
}

/**
 * One run of the design check (v0.4, automatic design check), as the dev toolbar sends it to the
 * project each time it checks (again): the design, the built component and page, when, how many
 * values match and every difference. The project keeps the latest run of each check for the agent.
 */
export const checkRunSchema = z.object({
  /** The design file (".luci/design/<file>", a basket export's name, or a pasted file's name). */
  design: z.string().min(1).max(300),
  /** How the toolbar names the design ("primary-button (button) from example.com"). */
  label: z.string().max(300),
  selector: z.string().min(1).max(1000),
  /** The page (origin and path). */
  page: z.url().max(2000),
  checkedAt: z.iso.datetime(),
  matches: z.number().int().nonnegative(),
  differences: z.array(z.object({
    kind: z.enum(CHECK_KINDS),
    part: z.string().max(200),
    state: z.string().max(40).optional(),
    property: z.string().max(200),
    expected: z.string().max(1000),
    actual: z.string().max(1000),
    comment: z.string().max(2000),
    priority: z.enum(['high', 'medium', 'low'])
  })).max(500)
});
export type CheckRun = z.infer<typeof checkRunSchema>;

/** A check run as text for the agent: what was checked, when, and each difference to fix. */
export function formatCheckRun(run: CheckRun): string {
  return formatCheckRunWithNotes(run, []);
}

/** A check run correlated with open feedback notes for the agent or CLI. */
export function formatCheckRunWithNotes(
  run: CheckRun,
  notes: readonly { ref: string; check?: { design: string; part: string; property: string; state?: string } }[] = []
): string {
  const d = run.differences;
  const normalize = (f: string) => f.replace(/^\.luci\/design\//, '').replace(/^\/+/, '');
  const runDesign = normalize(run.design);
  const findNote = (part: string, prop: string, state?: string) =>
    notes.find(n => n.check && normalize(n.check.design) === runDesign && n.check.part === part && n.check.property === prop && (n.check.state ?? '') === (state ?? ''));

  return [
    `## ${run.label || run.design}: ${d.length ? `${d.length} difference${d.length === 1 ? '' : 's'}` : 'matches design'}`,
    `- Design: ${run.design}; built: \`${run.selector}\` on ${run.page}`,
    `- Checked ${run.checkedAt}; ${run.matches} value${run.matches === 1 ? '' : 's'} match.`,
    ...(d.length ? ['', ...d.map((x, i) => {
      const n = findNote(x.part, x.property, x.state);
      const noteRef = n ? ` [Note: ${n.ref}]` : '';
      return `${i + 1}. ${x.comment}${x.priority === 'high' ? ' (accessibility)' : ''}${noteRef}`;
    })] : [])
  ].join('\n');
}

/**
 * The check as text to copy (the extension has no feedback notes): what was compared, and each
 * difference as a numbered fix for the agent.
 */
export function formatCheckReport(result: CheckResult, built: { selector: string; page: string; designFile?: string }): string {
  const d = result.differences;
  const out = [
    `# Design check: ${result.design.name} (${result.design.type})`,
    `Built: \`${built.selector}\` on ${built.page}`,
    `Design: ${built.designFile ?? result.design.name}, captured from ${result.design.source}`,
    `${result.matches.length} value${result.matches.length === 1 ? '' : 's'} match; ${d.length} difference${d.length === 1 ? '' : 's'}.`
  ];
  if (d.length) {
    out.push('', 'Make the built component match the design:');
    d.forEach((x, i) => out.push(`${i + 1}. ${x.comment}${x.priority === 'high' ? ' (accessibility)' : ''}`));
  } else {
    out.push('', 'Nothing to fix: it matches the design.');
  }
  return `${out.join('\n')}\n`;
}
