/**
 * Reading a component file back into values (v0.3, design check): its tokens, each part's styles,
 * the changes in each state, motion and the accessibility results, as the file writes them. The
 * design check reads the design file and the built component's file (formatted the same way) with
 * this reader, then compares the two (check.ts). Browser-safe, like the rest of the format.
 */
import { fail, ok, type ParseResult } from '../result.js';
import { parseCapture } from './format.js';
import { COMPONENT_STATES, type CaptureMeta } from './schema.js';

export type ComponentStateName = (typeof COMPONENT_STATES)[number];

/** One property of a part as the file writes it: the value with the user's unit and color settings, and its token. */
export interface SpecStyle { property: string; value: string; token?: string }
export interface SpecPart { part: string; element: string; optional: boolean; styles: SpecStyle[] }
export interface SpecChange { part: string; property: string; from: string; to: string; token?: string }
/**
 * A state: `changes` when the file lists what changes (possibly nothing visible), `no-change` when
 * Luci checked and nothing changes, `unknown` when Luci could not tell (stylesheets only).
 */
export interface SpecState { state: ComponentStateName; status: 'changes' | 'no-change' | 'unknown'; changes: SpecChange[]; trigger?: string }
export interface SpecMotion { part: string; kind: 'transition' | 'animation'; target: string; duration: string; easing: string; delay?: string }
export type SpecLevel = 'AAA' | 'AA' | 'fail' | 'yes' | 'no' | 'unknown';
export interface SpecCheck { check: 'contrast' | 'target' | 'focus'; part: string; measured: string; level: SpecLevel }

export interface ComponentSpec {
  meta: Omit<CaptureMeta, 'source'> & { source: string };
  /** The person's own instructions in the file ("## Your instructions"), when it has them. */
  instructions?: string;
  tokens: { token: string; value: string }[];
  /** The container first. */
  parts: SpecPart[];
  states: SpecState[];
  motion: SpecMotion[];
  accessibility: SpecCheck[];
}

/**
 * CSS properties a capture file can write for a part. A comma inside a value ("Inter, sans-serif",
 * a list of shadows) is told apart from the comma between two properties by the name that follows.
 */
export const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  'display', 'flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-self', 'row-gap', 'column-gap', 'gap', 'grid-template-columns',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-width', 'border-style', 'border-radius',
  'background', 'background-color', 'background-image', 'background-size', 'background-position', 'box-shadow', 'opacity', 'cursor',
  'outline', 'outline-offset', 'text-align', 'transform', 'filter', 'overflow', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'text-transform', 'text-decoration', 'text-decoration-line', 'white-space',
  'fill', 'stroke', 'object-fit', 'object-position', 'aspect-ratio', 'mix-blend-mode', 'clip-path', 'mask-image'
]);

/** A property name: one the format writes, or any lowercase hyphenated name (a value word never is one followed by a value). */
export const isProperty = (word: string) => STYLE_PROPERTIES.has(word) || /^[a-z]+(-[a-z]+)+$/.test(word);

/** Split at `sep` where it is outside parentheses and backticks. */
export function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let tick = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '`') tick = !tick;
    else if (!tick && c === '(') depth++;
    else if (!tick && c === ')') depth = Math.max(0, depth - 1);
    else if (!tick && depth === 0 && text.startsWith(sep, i)) {
      out.push(text.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** A table's body rows as cells (escaped "\|" kept as "|"). */
function tableRows(section: string): string[][] {
  const lines = section.split('\n').filter(l => l.trim().startsWith('|'));
  return lines.slice(2).map(l => {
    const cells = l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    return cells;
  });
}

const unquote = (text: string) => text.replace(/^`|`$/g, '');

/**
 * A value as written, without what follows it in parentheses: its token ("(`--brand`)"), what the site
 * authored ("(`clamp(...)`)", dropped) and the rem form of the "both" unit setting ("12px (0.75rem)").
 */
export function readValue(text: string): { value: string; token?: string } {
  let value = text.trim();
  let token: string | undefined;
  const note = /^(.*?) \(`([^`]*)`\)$/.exec(value);
  if (note) {
    value = note[1]!;
    if (/^--[\w-]+$/.test(note[2]!)) token = note[2]!;
  }
  const both = /^(.*\dpx.*) \(([^()]*rem[^()]*)\)$/.exec(value);
  if (both) value = both[1]!;
  return { value: value.trim(), ...(token ? { token } : {}) };
}

/** "display flex, padding 12px 20px, font-family Inter, sans-serif" -> one entry per property. */
export function readStyles(text: string): SpecStyle[] {
  if (/^no styles of its own$/.test(text.trim())) return [];
  const pieces: string[] = [];
  for (const piece of splitTop(text, ', ')) {
    const name = /^([a-z][a-z-]*) \S/.exec(piece)?.[1];
    if (name && isProperty(name) || !pieces.length) pieces.push(piece);
    else pieces[pieces.length - 1] += `, ${piece}`;
  }
  return pieces.flatMap(p => {
    const m = /^([a-z][a-z-]*) (.*)$/.exec(p.trim());
    return m ? [{ property: m[1]!, ...readValue(m[2]!) }] : [];
  });
}

/** "container — a (link), optional, appears on hover: display flex, ..." */
function readPart(line: string): SpecPart | null {
  // An identified icon is written into the part's description with a colon of its own
  // (", icon: lucide "check" (<Check />)"): set it aside, or the styles start at that colon (B-32)
  const plain = line.trim().replace(/, icon: [^"\n]*"[^"\n]*" \(<[^>\n]*>\)/, '');
  const m = /^- ([a-z0-9]+(?:-[a-z0-9]+)*)(?: \([×x](\d+)\))? — ([^:]+): (.*)$/.exec(plain);
  if (!m) return null;
  const count = m[2] ? parseInt(m[2], 10) : undefined;
  const [element, ...flags] = m[3]!.split(', ');
  return { part: m[1]!, element: element!.trim(), optional: flags.includes('optional'), ...(count ? { count } : {}), styles: readStyles(m[4]!) };
}

/** One change in a state's cell: "[part ]property from → to[ (`--token`)]". */
function readChange(text: string, parts: ReadonlySet<string>): SpecChange | null {
  const clean = text.replace(/ \(the browser's default focus ring\)$/, '').trim();
  const at = clean.indexOf(' → ');
  if (at === -1) return null;
  const words = clean.slice(0, at).split(' ');
  const hasPart = words.length > 1 && (parts.has(words[0]!) || !isProperty(words[0]!));
  const part = hasPart ? words.shift()! : 'container';
  const property = words.shift() ?? '';
  if (!property) return null;
  const to = readValue(clean.slice(at + 3));
  return { part, property, from: words.join(' '), to: to.value, ...(to.token ? { token: to.token } : {}) };
}

function readStates(section: string, parts: ReadonlySet<string>): SpecState[] {
  return tableRows(section).flatMap(([state, cell = '']): SpecState[] => {
    if (!(COMPONENT_STATES as readonly string[]).includes(state ?? '')) return [];
    const name = state as ComponentStateName;
    if (/^No change$/.test(cell)) return [{ state: name, status: 'no-change' as const, changes: [] }];
    if (/^(Not in the stylesheets|Not detected)/.test(cell)) return [{ state: name, status: 'unknown' as const, changes: [] }];
    if (/^No visible change$/.test(cell)) return [{ state: name, status: 'changes' as const, changes: [] }];
    const trigger = /^On the (.+?) around it \(`[^`]*`, \d+ levels? up\): /.exec(cell);
    const list = trigger ? cell.slice(trigger[0].length) : cell;
    const changes = splitTop(list, '; ').map(c => readChange(c, parts)).filter((c): c is SpecChange => c !== null);
    return [{ state: name, status: 'changes' as const, changes, ...(trigger ? { trigger: trigger[1]! } : {}) }];
  });
}

function readMotion(section: string): SpecMotion[] {
  return section.split('\n').flatMap(line => {
    const m = /^- (?:([a-z0-9]+(?:-[a-z0-9]+)*): )?(transition|animation) (\S+) (\S+) (.+?)(?:, delay (\S+))?$/.exec(line.trim());
    if (!m) return [];
    return [{ part: m[1] ?? 'container', kind: m[2] as 'transition' | 'animation', target: m[3]!, duration: m[4]!, easing: m[5]!, ...(m[6] ? { delay: m[6] } : {}) }];
  });
}

const CHECKS: Readonly<Record<string, SpecCheck['check']>> = { 'Text contrast': 'contrast', 'Target size': 'target', 'Focus visible': 'focus' };
function levelOf(result: string): SpecLevel {
  return /^AAA/.test(result) ? 'AAA' : /^AA\b/.test(result) ? 'AA' : /^Fails/.test(result) ? 'fail'
    : /^Yes/.test(result) ? 'yes' : /^No\b/.test(result) ? 'no' : 'unknown';
}

function readAccessibility(section: string | undefined): SpecCheck[] {
  if (!section) return [];
  return tableRows(section).flatMap(([check = '', part = '', measured = '', result = '']) => {
    const kind = CHECKS[check];
    return kind ? [{ check: kind, part: part || 'container', measured, level: levelOf(result) }] : [];
  });
}

/** Read a component file (scope component). Other scopes say what to pick instead. */
export function readComponentFile(text: string): ParseResult<ComponentSpec> {
  const parsed = parseCapture(text.replace(/^﻿/, '').replace(/\r\n/g, '\n'));
  if (!parsed.ok) return fail(parsed.error);
  const { meta, sections } = parsed.value;
  if (meta.scope !== 'component') {
    return fail(`"${meta.name}" is a ${meta.scope} file (${meta.type}). A design check needs a component file: capture the component with the Component tool, "This one".`);
  }
  const parts = (sections['Anatomy'] ?? '').split('\n').map(readPart).filter((p): p is SpecPart => p !== null);
  if (!parts.length) return fail(`"${meta.name}" has no parts under Anatomy.`);
  const names = new Set(parts.map(p => p.part));
  const tokens = tableRows(sections['Tokens'] ?? '').flatMap(([token = '', value = '']) => (/^`--[\w-]+`$/.test(token) ? [{ token: unquote(token), value }] : []));
  return ok({
    meta: meta as ComponentSpec['meta'],
    ...(sections['Your instructions'] ? { instructions: sections['Your instructions'] } : {}),
    tokens,
    parts,
    states: readStates(sections['States'] ?? '', names),
    motion: readMotion(sections['Motion'] ?? ''),
    accessibility: readAccessibility(sections['Accessibility'])
  });
}
