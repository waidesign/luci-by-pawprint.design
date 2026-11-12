/**
 * The formatter and parser for capture files. formatCapture is a pure function: the same
 * capture and settings always give the same text. Structure only: no page text, no image URLs.
 */
import { z } from 'zod';
import { parseFrontmatter } from '../skills/frontmatter.js';
import { fail, ok, type ParseResult } from '../result.js';
import {
  captureSchema,
  metaSchema,
  type Capture,
  type CaptureMeta,
  type CaptureSettings,
  type CapturedValue,
  type ColorSystem,
  type ColorToken,
  type ElementRef,
  type SpacingSystem,
  type SpacingToken,
  type TextStyle,
  type TextToken,
  type TypographySystem
} from './schema.js';
import { formatColor, formatLength } from './values.js';

export const CAPTURE_EXTENSION = '.design.md';

/** The sections every file of a scope and type has, in order. */
export const CAPTURE_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  'token/text': ['Text style', 'Where used'],
  'token/color': ['Colour', 'Where used'],
  'token/spacing': ['Spacing', 'Where used'],
  'system/typography': ['Roles', 'Families', 'Scale'],
  'system/color': ['Roles', 'Tokens'],
  'system/spacing': ['Scale', 'Base unit', 'Outliers']
};

/** "https://www.example.com/pricing?x=1#top" -> "https://www.example.com/pricing". */
export function cleanSource(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

/** "https://www.example.com/x" -> "example-com"; a local file -> "local". */
export function siteSlug(url: string): string {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* not a URL */ }
  const slug = host.replace(/^www\./, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'local';
}

/** Flat file name: example-com.token.color-primary.design.md, example-com.system.typography.design.md. */
export function captureFileName(meta: Pick<CaptureMeta, 'source' | 'scope' | 'name' | 'type'>): string {
  const part = meta.scope === 'system' ? meta.type : meta.name;
  return `${siteSlug(meta.source)}.${meta.scope}.${part}${CAPTURE_EXTENSION}`;
}

/** A name slug from free text: "Heading 1" -> "heading-1". */
export const toCaptureName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

// A YAML plain scalar when it is safe to read back (starts with a letter or digit; no "#", quotes
// or ": "; not a YAML keyword), JSON-quoted otherwise. The frontmatter reader accepts both.
const yaml = (value: string) =>
  /^[A-Za-z0-9][^#'"]*$/.test(value) && !value.includes(': ') && !/\s$/.test(value) && !/^(true|false|null|yes|no|on|off)$/i.test(value)
    ? value
    : JSON.stringify(value);

function frontmatter(meta: CaptureMeta): string {
  const m = metaSchema.parse(meta);
  const rows: [string, string | undefined][] = [
    ['name', m.name], ['scope', m.scope], ['type', m.type], ['source', cleanSource(m.source)],
    ['selector', m.selector], ['captured', m.captured], ['method', m.method], ['extends', m.extends]
  ];
  return ['---', ...rows.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${yaml(v!)}`), '---'].join('\n');
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const code = (text: string | undefined) => (text ? `\`${text.replace(/`/g, "'")}\`` : '');
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}
const ref = (r: ElementRef) => `${r.element}: ${code(r.selector)}`;

type Kind = 'length' | 'color' | 'raw';
const show = (v: CapturedValue, kind: Kind, s: CaptureSettings) =>
  kind === 'length' ? formatLength(v.computed, s) : kind === 'color' ? formatColor(v.computed, s) : v.computed;
/** The authored value, only when it says more than the computed one. */
const authored = (v: CapturedValue) => (v.authored && v.authored !== v.computed ? code(v.authored) : '');

const TEXT_ROWS: readonly [keyof TextStyle, string, Kind][] = [
  ['family', 'font-family', 'raw'], ['size', 'font-size', 'length'], ['weight', 'font-weight', 'raw'],
  ['lineHeight', 'line-height', 'length'], ['letterSpacing', 'letter-spacing', 'length'], ['color', 'color', 'color'],
  ['style', 'font-style', 'raw'], ['transform', 'text-transform', 'raw'], ['decoration', 'text-decoration', 'raw']
];

function textToken(c: TextToken, s: CaptureSettings): string[] {
  const rows = TEXT_ROWS.flatMap(([key, prop, kind]) => {
    const v = c.style[key];
    return v ? [[prop, show(v, kind, s), authored(v), code(v.token)]] : [];
  });
  return ['## Text style', table(['Property', 'Value', 'Authored', 'Token'], rows), '', '## Where used', `- ${ref(c.usedBy)}`];
}

function colorToken(c: ColorToken, s: CaptureSettings): string[] {
  const used = c.usedFor.length
    ? table(['Element', 'Property', 'Selector'], c.usedFor.map(u => [u.element, u.property, code(u.selector)]))
    : '- No element on the page uses this colour: it was picked from a pixel, so the value is estimated.';
  return [
    '## Colour', table(['Value', 'Authored', 'Token', 'Role'], [[show(c.value, 'color', s), authored(c.value), code(c.value.token), c.role ?? '']]),
    '', '## Where used', used
  ];
}

function spacingToken(c: SpacingToken, s: CaptureSettings): string[] {
  const where = c.between
    ? [`- From ${ref(c.between[0])}`, `- To ${ref(c.between[1])}`]
    : c.usedBy ? [`- ${ref(c.usedBy)}`] : ['- Not recorded.'];
  return [
    '## Spacing',
    table(['Value', 'Kind', 'Property', 'Label', 'Authored', 'Token'], [[show(c.value, 'length', s), c.kind, c.property ?? '', c.label, authored(c.value), code(c.value.token)]]),
    '', '## Where used', ...where
  ];
}

function typographySystem(c: TypographySystem, s: CaptureSettings): string[] {
  const roles = c.roles.map(r => [
    r.role, r.style.family.computed, show(r.style.size, 'length', s), r.style.weight.computed,
    show(r.style.lineHeight, 'length', s), show(r.style.letterSpacing, 'length', s), show(r.style.color, 'color', s),
    String(r.count), r.elements.join(', ')
  ]);
  return [
    '## Roles', table(['Role', 'Family', 'Size', 'Weight', 'Line height', 'Letter spacing', 'Colour', 'Uses', 'Elements'], roles),
    '', '## Families', table(['Family', 'Uses'], c.families.map(f => [f.family, String(f.count)])),
    '', '## Scale', table(['Size', 'Token', 'Uses'], c.scale.map(x => [show(x.size, 'length', s), code(x.size.token), String(x.count)]))
  ];
}

function colorSystem(c: ColorSystem, s: CaptureSettings): string[] {
  const tokens = c.tokens.length
    ? table(['Token', 'Value', 'Uses'], c.tokens.map(t => [code(t.token), formatColor(t.value, s), String(t.count)]))
    : '- The page defines no colour custom properties.';
  return [
    '## Roles', table(['Role', 'Value', 'Authored', 'Token', 'Uses', 'Properties'], c.roles.map(r => [r.role, show(r.value, 'color', s), authored(r.value), code(r.value.token), String(r.count), r.properties.join(', ')])),
    '', '## Tokens', tokens
  ];
}

function spacingSystem(c: SpacingSystem, s: CaptureSettings): string[] {
  const base = c.baseUnit
    ? `- ${formatLength(`${c.baseUnit.px}px`, s)}: ${Math.round(c.baseUnit.share * 100)}% of spacing uses are multiples of it.`
    : '- None: the spacing values share no common unit.';
  const outliers = c.outliers.length
    ? table(['Value', 'Uses'], c.outliers.map(o => [show(o.value, 'length', s), String(o.count)]))
    : '- None.';
  return [
    '## Scale', table(['Value', 'Authored', 'Token', 'Uses'], c.scale.map(x => [show(x.value, 'length', s), authored(x.value), code(x.value.token), String(x.count)])),
    '', '## Base unit', base, '', '## Outliers', outliers
  ];
}

/** The file text for a capture. Throws when the capture does not match its schema. */
export function formatCapture(capture: Capture, settings: CaptureSettings = {}): string {
  const c = captureSchema.parse(capture);
  const key = `${c.meta.scope}/${c.meta.type}`;
  const body = key === 'token/text' ? textToken(c as TextToken, settings)
    : key === 'token/color' ? colorToken(c as ColorToken, settings)
    : key === 'token/spacing' ? spacingToken(c as SpacingToken, settings)
    : key === 'system/typography' ? typographySystem(c as TypographySystem, settings)
    : key === 'system/color' ? colorSystem(c as ColorSystem, settings)
    : spacingSystem(c as SpacingSystem, settings);
  return `${frontmatter(c.meta)}\n\n${body.join('\n')}\n`;
}

export interface ParsedCapture {
  meta: CaptureMeta;
  /** Section bodies by heading (without "## "). */
  sections: Record<string, string>;
}

/** Read a capture file: valid frontmatter and every section its scope and type need. */
export function parseCapture(text: string): ParseResult<ParsedCapture> {
  const fm = parseFrontmatter(text);
  if (!fm.hasFrontmatter) return fail('capture file has no frontmatter');
  const meta = metaSchema.safeParse(fm.data);
  if (!meta.success) return fail(`capture frontmatter is not valid:\n${z.prettifyError(meta.error)}`);
  const sections: Record<string, string> = {};
  let current: string | null = null;
  for (const line of fm.content.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) { current = h[1]!.trim(); sections[current] = ''; } else if (current) sections[current] += `${line}\n`;
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k]!.trim();
  const expected = CAPTURE_SECTIONS[`${meta.data.scope}/${meta.data.type}`];
  const missing = (expected ?? []).filter(h => !(h in sections));
  if (missing.length) return fail(`capture "${meta.data.name}" is missing sections: ${missing.join(', ')}`);
  return ok({ meta: meta.data, sections });
}
