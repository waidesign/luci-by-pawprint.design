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
  siteNameSchema,
  type Capture,
  type CaptureMeta,
  type CaptureSettings,
  type CapturedValue,
  type ColorSystem,
  type ColorToken,
  type ComponentCapture,
  type ElementRef,
  type PageCapture,
  type SpacingSet,
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
  'token/color': ['Color', 'Where used'],
  'token/spacing': ['Spacing', 'Where used'],
  'system/typography': ['Roles', 'Families', 'Scale'],
  'system/color': ['Roles', 'Tokens'],
  'system/spacing': ['Scale', 'Base unit', 'Outliers'],
  'page/page': ['Typography', 'Colors', 'Spacing', 'Components']
};

/** Every component file has these; "Variants" is added for the whole-system output. */
export const COMPONENT_SECTIONS: readonly string[] = ['Tokens', 'Anatomy', 'States', 'Motion'];

/** "https://www.example.com/pricing?x=1#top" -> "https://www.example.com/pricing". */
export function cleanSource(url: string): string {
  const u = new URL(url);
  // A file: URL has no origin ("null"): keep its scheme and path
  return u.origin === 'null' ? `${u.protocol}//${u.host}${u.pathname}` : `${u.origin}${u.pathname}`;
}

/** "https://www.lattice.com/pricing?x=1" -> "lattice.com" (with the port for a local server). */
export function siteName(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

/**
 * The source as a file writes it: the page (origin and path) by default, or only the site's name
 * with the "site" setting. A page without a host (a local file) keeps its address.
 */
export const sourceText = (url: string, settings: CaptureSettings = {}) =>
  (settings.source === 'site' && siteName(url) ? siteName(url) : cleanSource(url));

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

function frontmatter(meta: CaptureMeta, settings: CaptureSettings): string {
  const m = metaSchema.parse(meta);
  const rows: [string, string | undefined][] = [
    ['name', m.name], ['scope', m.scope], ['type', m.type], ['source', sourceText(m.source, settings)],
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
/** Colors inside compound values ("2px solid rgb(15, 98, 254)", shadows) follow the color setting too. */
const EMBEDDED_COLOR = /rgba?\([^)]*\)/g;
const show = (v: CapturedValue, kind: Kind, s: CaptureSettings) =>
  kind === 'length' ? formatLength(v.computed, s).replace(EMBEDDED_COLOR, c => formatColor(c, s))
    : kind === 'color' ? formatColor(v.computed, s) : v.computed;
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
    : '- No element on the page uses this color: it was picked from a pixel, so the value is estimated.';
  return [
    '## Color', table(['Value', 'Authored', 'Token', 'Role'], [[show(c.value, 'color', s), authored(c.value), code(c.value.token), c.role ?? '']]),
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

function spacingSet(c: SpacingSet, s: CaptureSettings): string[] {
  return [
    '## Spacing',
    table(['Value', 'Kind', 'Property', 'Label', 'Authored', 'Token'], c.values.map(v => [show(v.value, 'length', s), v.kind, v.property, 'authored', authored(v.value), code(v.value.token)])),
    '', '## Where used', `- ${ref(c.usedBy)}`
  ];
}

function typographySystem(c: TypographySystem, s: CaptureSettings): string[] {
  const roles = c.roles.map(r => [
    r.role, r.style.family.computed, show(r.style.size, 'length', s), r.style.weight.computed,
    show(r.style.lineHeight, 'length', s), show(r.style.letterSpacing, 'length', s), show(r.style.color, 'color', s),
    String(r.count), r.elements.join(', ')
  ]);
  return [
    '## Roles', table(['Role', 'Family', 'Size', 'Weight', 'Line height', 'Letter spacing', 'Color', 'Uses', 'Elements'], roles),
    '', '## Families', table(['Family', 'Uses'], c.families.map(f => [f.family, String(f.count)])),
    '', '## Scale', table(['Size', 'Token', 'Uses'], c.scale.map(x => [show(x.size, 'length', s), code(x.size.token), String(x.count)]))
  ];
}

function colorSystem(c: ColorSystem, s: CaptureSettings): string[] {
  const tokens = c.tokens.length
    ? table(['Token', 'Value', 'Uses'], c.tokens.map(t => [code(t.token), formatColor(t.value, s), String(t.count)]))
    : '- The page defines no color custom properties.';
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

/** Colors by property name; every other value goes through the length formatter (keywords pass unchanged). */
const kindOf = (property: string): Kind => (/color$|^fill$|^stroke$/.test(property) ? 'color' : 'length');
const styleText = (property: string, v: CapturedValue, s: CaptureSettings) =>
  `${property} ${show(v, kindOf(property), s)}${v.token ? ` (${code(v.token)})` : v.authored && v.authored !== v.computed ? ` (${code(v.authored)})` : ''}`;

const STATE_SOURCE: Readonly<Record<string, string>> = { forced: 'browser, state forced', rules: 'stylesheet rules', attribute: 'disabled attribute', manual: 'captured by hand' };

function componentBody(c: ComponentCapture, s: CaptureSettings, noStates = '- Not read.'): string[] {
  const tokens = c.tokens.length
    ? table(['Token', 'Value', 'Used for'], c.tokens.map(t => [code(t.token), kindOf(t.usedFor[0] ?? '') === 'color' ? formatColor(t.value, s) : formatLength(t.value, s), t.usedFor.join(', ')]))
    : '- The component uses no custom properties.';
  const anatomy = c.anatomy.map(p => {
    const label = `${p.part} — ${p.element}${p.optional ? ', optional' : ''}`;
    return `- ${label}: ${p.styles.length ? p.styles.map(e => styleText(e.property, e.value, s)).join(', ') : 'no styles of its own'}`;
  });
  const states = c.states.length
    ? table(['State', 'Changes', 'Read from'], c.states.map(st => [
        st.state,
        !st.detected ? 'Not detected: it may change through JavaScript. Capture it by hand in Luci.'
          : st.changes.length ? st.changes.map(ch => `${ch.part && ch.part !== c.anatomy[0]!.part ? `${ch.part} ` : ''}${ch.property} ${show({ computed: ch.from }, kindOf(ch.property), s)} → ${show(ch.to, kindOf(ch.property), s)}${ch.to.token ? ` (${code(ch.to.token)})` : ''}`).join('; ')
          : 'No visible change',
        st.method ? STATE_SOURCE[st.method]! : ''
      ]))
    : noStates;
  const motion = c.motion.length
    ? c.motion.map(m => `- ${m.kind} ${m.target} ${m.duration} ${m.easing}${m.delay && m.delay !== '0s' ? `, delay ${m.delay}` : ''}`)
    : ['- None.'];
  const out = ['## Tokens', tokens, '', '## Anatomy', ...anatomy, '', '## States', states, '', '## Motion', ...motion];
  if (c.variants) {
    out.push('', '## Variants', c.variants.length
      ? table(['Variant', 'Uses', 'Differences from this one', 'Example'], c.variants.map(v => [v.name, String(v.count), v.differences.length ? v.differences.map(d => styleText(d.property, d.value, s)).join(', ') : 'same styles', code(v.selector)]))
      : '- No similar elements on this page.');
  }
  return out;
}

/** Headings `levels` deeper ("## Roles" -> "### Roles"), so a part can sit inside a larger file. */
export const deeperHeadings = (text: string, levels = 1) => text.replace(/^#{2,5} /gm, h => `${'#'.repeat(levels)}${h}`);

function pageBody(c: PageCapture, s: CaptureSettings): string[] {
  const part = (lines: string[] | null, none: string) => (lines ? deeperHeadings(lines.join('\n')) : `- ${none}`);
  const components = c.components.length
    ? c.components.flatMap(k => [
        '',
        `### ${k.meta.name}`,
        `- ${k.meta.type} · example: ${code(k.meta.selector)}${k.variants ? ` · ${k.variants.reduce((n, v) => n + v.count, 0)} on the page, ${k.variants.length} variant${k.variants.length === 1 ? '' : 's'}` : ''}`,
        '',
        deeperHeadings(componentBody(k, s, '- No state styles found in the stylesheets.').join('\n'), 2)
      ])
    : ['', '- No components found on this page.'];
  return [
    '## Typography', part(c.typography && typographySystem(c.typography, s), 'The page has no visible text.'),
    '', '## Colors', part(c.color && colorSystem(c.color, s), 'The page has no visible colors.'),
    '', '## Spacing', part(c.spacing && spacingSystem(c.spacing, s), 'The page sets no spacing.'),
    '', '## Components', `- ${c.components.length} kind${c.components.length === 1 ? '' : 's'} of component on this page, each with its variants and the states its stylesheet rules give it. For a state done in JavaScript, capture that component on its own with Luci.`,
    ...components
  ];
}

export const INSTRUCTIONS_HEADING = '## Your instructions';

/** The user's text as a section body: word for word, but a line starting with "#" cannot become a heading. */
const instructionsText = (text: string) => text.trim().replace(/\r\n/g, '\n').split('\n').map(l => (/^\s*#/.test(l) ? `\\${l.trimStart()}` : l)).join('\n');

/**
 * Put the user's instructions into a capture file's text (e.g. one edited by hand): replace the
 * "## Your instructions" section, or add it right after the frontmatter. Empty text removes it.
 */
export function withInstructions(markdown: string, text: string | undefined): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(l => l.trim() === INSTRUCTIONS_HEADING);
  if (start !== -1) {
    let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
    if (end === -1) end = lines.length;
    lines.splice(start, end - start);
  }
  const block = text && text.trim() ? [INSTRUCTIONS_HEADING, instructionsText(text), ''] : [];
  if (block.length) {
    // After the frontmatter (and its blank line), before the first section
    const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
    let at = fmEnd === -1 ? 0 : fmEnd + 1;
    while (lines[at] === '') at++;
    lines.splice(at, 0, ...block);
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** The file text for a capture. Throws when the capture does not match its schema. */
export function formatCapture(capture: Capture, settings: CaptureSettings = {}): string {
  const c = captureSchema.parse(capture);
  return c.instructions ? withInstructions(formatMeasured(c, settings), c.instructions) : formatMeasured(c, settings);
}

/** The measured part of a capture file, without the user's instructions. */
function formatMeasured(c: Capture, settings: CaptureSettings): string {
  const key = `${c.meta.scope}/${c.meta.type}`;
  if (c.meta.scope === 'component') return `${frontmatter(c.meta, settings)}\n\n${componentBody(c as ComponentCapture, settings).join('\n')}\n`;
  const body = key === 'page/page' ? pageBody(c as PageCapture, settings)
    : key === 'token/text' ? textToken(c as TextToken, settings)
    : key === 'token/color' ? colorToken(c as ColorToken, settings)
    : key === 'token/spacing' ? ('values' in c ? spacingSet(c as SpacingSet, settings) : spacingToken(c as SpacingToken, settings))
    : key === 'system/typography' ? typographySystem(c as TypographySystem, settings)
    : key === 'system/color' ? colorSystem(c as ColorSystem, settings)
    : spacingSystem(c as SpacingSystem, settings);
  return `${frontmatter(c.meta, settings)}\n\n${body.join('\n')}\n`;
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
  // A file written with the "site" source setting names only the site
  const meta = metaSchema.extend({ source: z.union([z.url(), siteNameSchema]) }).safeParse(fm.data);
  if (!meta.success) return fail(`capture frontmatter is not valid:\n${z.prettifyError(meta.error)}`);
  const sections: Record<string, string> = {};
  let current: string | null = null;
  for (const line of fm.content.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) { current = h[1]!.trim(); sections[current] = ''; } else if (current) sections[current] += `${line}\n`;
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k]!.trim();
  const expected = meta.data.scope === 'component' ? COMPONENT_SECTIONS : CAPTURE_SECTIONS[`${meta.data.scope}/${meta.data.type}`];
  const missing = (expected ?? []).filter(h => !(h in sections));
  if (missing.length) return fail(`capture "${meta.data.name}" is missing sections: ${missing.join(', ')}`);
  return ok({ meta: meta.data, sections });
}
