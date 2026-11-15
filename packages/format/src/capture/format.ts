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
  type Accessibility,
  type Capture,
  type CaptureMeta,
  type CaptureSettings,
  type CapturedValue,
  type ColorSet,
  type ColorSystem,
  type ColorToken,
  type ComponentCapture,
  type ElementRef,
  type PageCapture,
  type Responsive,
  type SectionCapture,
  type SpacingSet,
  type SpacingSystem,
  type SpacingToken,
  type SystemConflict,
  type TextStyle,
  type TextToken,
  type TypographySystem
} from './schema.js';
import { formatColor, formatLength, formatShadow, formatTransform, parseColor, resolveSettings, round, withoutUrls } from './values.js';
import { formatLayoutTree } from './layout.js';

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
/** Every section file (scope section) has these. */
export const SECTION_SECTIONS: readonly string[] = ['Tokens', 'Structure', 'Components'];

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

/**
 * Flat file name: example-com.token.color-primary.design.md, example-com.system.typography.design.md;
 * a site-level system (v0.3.3, with pages): example-com.system.site-typography.design.md.
 */
export function captureFileName(meta: Pick<CaptureMeta, 'source' | 'scope' | 'name' | 'type'> & { pages?: readonly string[] | undefined }): string {
  const part = meta.scope === 'system' ? `${meta.pages ? 'site-' : ''}${meta.type}` : meta.name;
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

function frontmatter(meta: CaptureMeta & { pages?: readonly string[] | undefined }, settings: CaptureSettings): string {
  const m = metaSchema.parse(meta);
  const rows: [string, string | undefined][] = [
    ['name', m.name], ['scope', m.scope], ['type', m.type], ['source', sourceText(m.source, settings)],
    ['selector', m.selector], ['captured', m.captured], ['method', m.method], ['extends', m.extends]
  ];
  const lines = rows.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${yaml(v!)}`);
  // A site-level system: the pages it was merged from, by path (the source is the site)
  if (meta.pages) lines.push(`pages: [${meta.pages.map(p => JSON.stringify(pagePath(p))).join(', ')}]`);
  return ['---', ...lines, '---'].join('\n');
}

/** "https://example.com/pricing" -> "/pricing". */
const pagePath = (url: string) => { try { return new URL(url).pathname || '/'; } catch { return url; } };
/** Which pages use a row of a site-level system: "all", or their paths. */
const pagesCell = (pages: readonly string[] | undefined, all: readonly string[]) =>
  (!pages ? '' : all.every(p => pages.includes(p)) ? 'all' : pages.map(pagePath).join(', '));

export const CONFLICTS_NOTE = '- The same role or token has different values on these pages. Decide which one the site means before building with it.';

/** Conflicts of a site-level system: each role or token with its values, and the pages that use each. */
function conflictsSection(conflicts: readonly SystemConflict[] | undefined, s: CaptureSettings): string[] {
  const value = (v: string) => (parseColor(v) ? formatColor(v, s) : show({ computed: v }, 'length', s));
  return [
    '## Conflicts',
    conflicts?.length
      ? table(['What', 'Values by page'], conflicts.map(c => [c.what, c.values.map(v => `${value(v.value)} on ${v.pages.map(pagePath).join(', ')}`).join('; ')]))
      : '- None: every role and token has one value on every page.',
    ...(conflicts?.length ? ['', CONFLICTS_NOTE] : [])
  ];
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const code = (text: string | undefined) => (text ? `\`${text.replace(/`/g, "'")}\`` : '');
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}
const ref = (r: ElementRef) => `${r.element}: ${code(r.selector)}`;

type Kind = 'length' | 'color' | 'transform' | 'shadow' | 'raw';
/** Colors inside compound values ("2px solid rgb(15, 98, 254)", shadows) follow the color setting too. */
const EMBEDDED_COLOR = /rgba?\([^)]*\)|color\(srgb [^)]*\)/g;
/** A value as the settings ask; any url(...) in it is written "<image>" (FR21: no image addresses). */
const show = (v: CapturedValue, kind: Kind, s: CaptureSettings) => {
  const computed = withoutUrls(v.computed);
  return kind === 'shadow' ? formatLength(formatShadow(computed), s).replace(EMBEDDED_COLOR, c => formatColor(c, s))
    : kind === 'length' ? formatLength(computed, s).replace(EMBEDDED_COLOR, c => formatColor(c, s))
    : kind === 'transform' ? formatLength(formatTransform(computed), s)
    : kind === 'color' ? formatColor(computed, s) : computed;
};
/** The authored value, only when it says more than the computed one. */
const authored = (v: CapturedValue) => (v.authored && v.authored !== v.computed ? code(withoutUrls(v.authored)) : '');

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
  const out = ['## Text style', table(['Property', 'Value', 'Authored', 'Token'], rows), '', '## Where used', `- ${ref(c.usedBy)}`];
  if (c.accessibility) out.push('', ...accessibilitySection(c.accessibility, s));
  return out;
}

export const ACCESSIBILITY_NOTE = '- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.';

/** The ratios a text needs: AA and AAA, lower for large text. */
const NEEDS = { normal: [4.5, 7], large: [3, 4.5] } as const;

/** Accessibility notes as one table: contrast per text part, target size, focus visible. */
export function accessibilitySection(a: Accessibility, s: CaptureSettings): string[] {
  const rows: string[][] = [];
  for (const c of a.contrast) {
    const [aa, aaa] = NEEDS[c.large ? 'large' : 'normal'];
    const result = c.level === 'AAA' ? 'AAA'
      : c.level === 'AA' ? `AA (AAA needs ${aaa}:1)`
      : `Fails (AA needs ${aa}:1)`;
    rows.push([
      'Text contrast', c.part ?? '',
      `${round(c.ratio, 2)}:1, ${formatColor(c.text, s)} on ${formatColor(c.background, s)}, ${c.large ? 'large' : 'normal'} text`,
      `${result}${c.estimated ? '. Estimated: the background is an image, a gradient or see-through' : ''}`
    ]);
  }
  if (a.target) {
    const t = a.target;
    rows.push(['Target size', 'container', sizeText(t.width, t.height, s),
      t.level === 'AAA' ? 'AAA (at least 44 × 44px)' : t.level === 'AA' ? 'AA (at least 24 × 24px; AAA needs 44 × 44px)' : 'Fails (AA needs 24 × 24px, unless it is a link inside a sentence)']);
  }
  if (a.focus) {
    const f = a.focus;
    rows.push(['Focus visible', 'container',
      f.visible ? `${f.by.join(', ')} change${f.state ? ` on ${f.state}` : ''}` : f.visible === false ? 'nothing changes when it has focus' : 'not read: only stylesheet rules were checked',
      f.visible ? 'Yes' : f.visible === false ? 'No: add a visible focus style' : 'Unknown: capture the component on its own in Luci to check']);
  }
  if (!rows.length) return ['## Accessibility', '- Nothing to check: no text, and nothing to click or focus.'];
  return ['## Accessibility', table(['Check', 'Part', 'Measured', 'Result'], rows), '', ACCESSIBILITY_NOTE];
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

function colorSet(c: ColorSet, s: CaptureSettings): string[] {
  const rows = c.colors.map(col => [
    show(col.value, 'color', s),
    authored(col.value),
    code(col.value.token),
    col.role ?? '',
    col.usedFor.map(u => `${u.element} (${u.property})`).slice(0, 4).join(', ')
  ]);
  return [
    '## Color', table(['Value', 'Authored', 'Token', 'Role', 'Where used'], rows),
    '', '## Where used', `- ${ref(c.usedBy)}`
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

/** A site-level system's tables get a Pages column, and the file a Conflicts section. */
const sitePages = (c: { meta: { pages?: string[] | undefined } }) => c.meta.pages;
const withPages = (head: readonly string[], pages: readonly string[] | undefined) => (pages ? [...head, 'Pages'] : [...head]);
const pageCol = (row: { pages?: string[] | undefined }, pages: readonly string[] | undefined) => (pages ? [pagesCell(row.pages, pages)] : []);

function typographySystem(c: TypographySystem, s: CaptureSettings): string[] {
  const all = sitePages(c);
  const roles = c.roles.map(r => [
    r.role, r.style.family.computed, show(r.style.size, 'length', s), r.style.weight.computed,
    show(r.style.lineHeight, 'length', s), show(r.style.letterSpacing, 'length', s), show(r.style.color, 'color', s),
    String(r.count), r.elements.join(', '), ...pageCol(r, all)
  ]);
  return [
    '## Roles', table(withPages(['Role', 'Family', 'Size', 'Weight', 'Line height', 'Letter spacing', 'Color', 'Uses', 'Elements'], all), roles),
    '', '## Families', table(['Family', 'Uses'], c.families.map(f => [f.family, String(f.count)])),
    '', '## Scale', table(['Size', 'Token', 'Uses'], c.scale.map(x => [show(x.size, 'length', s), code(x.size.token), String(x.count)])),
    ...(all ? ['', ...conflictsSection(c.conflicts, s)] : [])
  ];
}

/** Screenshot mode (v0.4): what an estimated color system says about itself. */
export const ESTIMATED_IMAGE_NOTE = '- Estimated from an image: an image has no custom properties, and every color here is a guess from its pixels (Share is its share of the picture). Text styles and spacing cannot be read from an image.';

function colorSystem(c: ColorSystem, s: CaptureSettings): string[] {
  const all = sitePages(c);
  // A palette estimated from an image: its rows say how much of the picture each color covers
  const image = c.meta.method === 'estimated' && c.roles.every(r => r.properties.length === 1 && r.properties[0] === 'image');
  const tokens = c.tokens.length
    ? table(withPages(['Token', 'Value', 'Uses'], all), c.tokens.map(t => [code(t.token), formatColor(t.value, s), String(t.count), ...pageCol(t, all)]))
    : image ? ESTIMATED_IMAGE_NOTE
    : `- The ${all ? 'site' : 'page'} defines no color custom properties.`;
  if (image) return ['## Roles', table(['Role', 'Value', 'Share'], c.roles.map(r => [r.role, show(r.value, 'color', s), `${r.count}%`])), '', '## Tokens', tokens];
  return [
    '## Roles', table(withPages(['Role', 'Value', 'Authored', 'Token', 'Uses', 'Properties'], all), c.roles.map(r => [r.role, show(r.value, 'color', s), authored(r.value), code(r.value.token), String(r.count), r.properties.join(', '), ...pageCol(r, all)])),
    '', '## Tokens', tokens,
    ...(all ? ['', ...conflictsSection(c.conflicts, s)] : [])
  ];
}

function spacingSystem(c: SpacingSystem, s: CaptureSettings): string[] {
  const all = sitePages(c);
  const base = c.baseUnit
    ? `- ${formatLength(`${c.baseUnit.px}px`, s)}: ${Math.round(c.baseUnit.share * 100)}% of spacing uses are multiples of it.`
    : '- None: the spacing values share no common unit.';
  const outliers = c.outliers.length
    ? table(['Value', 'Uses'], c.outliers.map(o => [show(o.value, 'length', s), String(o.count)]))
    : '- None.';
  return [
    '## Scale', table(withPages(['Value', 'Authored', 'Token', 'Uses'], all), c.scale.map(x => [show(x.value, 'length', s), authored(x.value), code(x.value.token), String(x.count), ...pageCol(x, all)])),
    '', '## Base unit', base, '', '## Outliers', outliers,
    ...(all ? ['', ...conflictsSection(c.conflicts, s)] : [])
  ];
}

/** Colors by property name; every other value goes through the length formatter (keywords pass unchanged). */
const kindOf = (property: string): Kind =>
  (/color$|^fill$|^stroke$/.test(property) ? 'color' : property === 'transform' ? 'transform' : property === 'box-shadow' ? 'shadow' : 'length');
const styleText = (property: string, v: CapturedValue, s: CaptureSettings) =>
  `${property} ${show(v, kindOf(property), s)}${v.token ? ` (${code(v.token)})` : v.authored && v.authored !== v.computed ? ` (${code(withoutUrls(v.authored))})` : ''}`;

const STATE_SOURCE: Readonly<Record<string, string>> = {
  forced: 'browser, state forced', rules: 'stylesheet rules', attribute: 'disabled attribute', pointer: 'browser, pointer moved onto it', manual: 'captured by hand'
};

type ComponentState = ComponentCapture['states'][number];

/** What a state that changed nothing says: no change when Luci could check, a hint when it could not. */
function notDetected(st: ComponentState): string {
  if (st.method === 'forced' || st.method === 'pointer' || st.method === 'attribute') return 'No change';
  if (st.method === 'rules') return 'Not in the stylesheets: it may change through JavaScript. Capture it by hand in Luci.';
  return 'Not detected: it may change through JavaScript. Capture it by hand in Luci.';
}

/** One state's changes; a state triggered from an element around the component says which. */
function stateChanges(st: ComponentState, container: string, s: CaptureSettings): string {
  const list = st.changes.map(ch => {
    const value = `${ch.part && ch.part !== container ? `${ch.part} ` : ''}${ch.property} ${show({ computed: ch.from }, kindOf(ch.property), s)} → ${show(ch.to, kindOf(ch.property), s)}${ch.to.token ? ` (${code(ch.to.token)})` : ''}`;
    // Chrome's own focus ring is "auto"; say so, so it is not taken for the site's design
    return ch.property === 'outline' && /\bauto\b/.test(ch.to.computed) ? `${value} (the browser's default focus ring)` : value;
  }).join('; ');
  const where = st.trigger ? `On the ${st.trigger.element} around it (${code(st.trigger.selector)}, ${st.trigger.depth} level${st.trigger.depth === 1 ? '' : 's'} up): ` : '';
  return `${where}${list}`;
}

type ComponentImage = NonNullable<ComponentCapture['images']>[number];
const IMAGE_KIND_LABEL: Readonly<Record<ComponentImage['kind'], string>> = { img: 'img', video: 'video', canvas: 'canvas', 'svg-image': 'SVG image', background: 'background image' };
const EFFECTS = ['box-shadow', 'filter', 'opacity', 'mix-blend-mode', 'mask-image', 'clip-path'] as const;
export const IMAGES_NOTE = '- These are slots for your own images, framed as above. No image file or URL is included.';

/** "640 × 360px", "40 × 22.5rem" or "640 × 360px (40 × 22.5rem)", as the unit setting asks. */
function sizeText(width: number, height: number, settings: CaptureSettings): string {
  const s = resolveSettings(settings);
  const px = `${round(width, 2)} × ${round(height, 2)}px`;
  const rem = `${round(width / s.rootFontSize, 4)} × ${round(height / s.rootFontSize, 4)}rem`;
  return s.units === 'px' ? px : s.units === 'rem' ? rem : `${px} (${rem})`;
}

/**
 * One row per image slot: its part, kind, size and shape, how it fits, its corners, effects and the
 * layers over it. Every url(...) is written "<image>", whatever reaches the formatter (FR21).
 */
function imagesSection(images: readonly ComponentImage[], s: CaptureSettings): string[] {
  const rows = images.map(img => {
    const get = (p: string) => img.treatment.find(t => t.property === p);
    const val = (p: string) => {
      const t = get(p);
      return t ? `${show(t.value, kindOf(p), s)}${t.value.token ? ` (${code(t.value.token)})` : ''}` : '';
    };
    const shape = `${img.aspectRatio}${img.sourceAspectRatio ? ` (file is ${img.sourceAspectRatio})` : ''}${get('aspect-ratio') ? `, set by aspect-ratio ${val('aspect-ratio')}` : ''}`;
    const fit = [
      val('object-fit') || val('background-size') || (get('preserveAspectRatio') ? `preserveAspectRatio ${val('preserveAspectRatio')}` : ''),
      get('object-position') || get('background-position') ? `position ${val('object-position') || val('background-position')}` : '',
      val('background-repeat')
    ].filter(Boolean).join(', ') || (img.kind === 'background' ? 'auto' : 'fill');
    const radius = get('border-radius');
    const corners = radius
      ? `${val('border-radius')}${radius.corners ? `, ${radius.corners} corners` : ''}${radius.on ? `, clipped by the ${radius.on}${radius.on === 'container' ? '' : ' around it'}` : ''}`
      : 'none';
    const effects = EFFECTS.filter(p => get(p)).map(p => `${p} ${val(p)}`).join('; ') || 'none';
    // A background photo's own gradients are drawn over it: they count as layers too
    const own = get('background-image');
    const layers = [
      ...(own ? [`its own background: ${val('background-image')}`] : []),
      ...img.overlays.map(o => `${o.on}: ${show({ computed: withoutUrls(o.background) }, 'length', s)}${o.opacity ? `, opacity ${o.opacity}` : ''}${o.blend ? `, blend ${o.blend}` : ''}`)
    ].join('; ') || 'none';
    return [img.part, IMAGE_KIND_LABEL[img.kind], sizeText(img.size.width, img.size.height, s), shape, fit, corners, effects, layers];
  });
  return [table(['Part', 'Kind', 'Size', 'Shape', 'Fit', 'Corners', 'Effects', 'Layers over it'], rows), '', IMAGES_NOTE];
}

function componentBody(c: ComponentCapture, s: CaptureSettings, noStates = '- Not read.'): string[] {
  const tokens = c.tokens.length
    ? table(['Token', 'Value', 'Used for'], c.tokens.map(t => [code(t.token), kindOf(t.usedFor[0] ?? '') === 'color' ? formatColor(t.value, s) : formatLength(t.value, s), t.usedFor.join(', ')]))
    : '- The component uses no custom properties.';
  const anatomy = c.anatomy.map(p => {
    const indent = s.layoutTree && p.depth && p.depth > 0 ? '  '.repeat(p.depth) : '';
    const appears = p.appearsIn?.length ? `, appears on ${p.appearsIn.join(' and ')}` : '';
    const label = `${p.part} — ${p.element}${p.optional ? ', optional' : ''}${appears}`;
    return `${indent}- ${label}: ${p.styles.length ? p.styles.map(e => styleText(e.property, e.value, s)).join(', ') : 'no styles of its own'}`;
  });
  const states = c.states.length
    ? table(['State', 'Changes', 'Read from'], c.states.map(st => [
        st.state,
        !st.detected ? notDetected(st) : st.changes.length ? stateChanges(st, c.anatomy[0]!.part, s) : 'No visible change',
        st.method ? STATE_SOURCE[st.method]! : ''
      ]))
    : noStates;
  const motion = c.motion.length
    ? c.motion.map(m => `- ${m.part ? `${m.part}: ` : ''}${m.kind} ${m.target} ${m.duration} ${m.easing}${m.delay && m.delay !== '0s' ? `, delay ${m.delay}` : ''}`)
    : ['- None.'];
  const out = ['## Tokens', tokens, '', '## Anatomy', ...anatomy];
  if (c.layoutTree && s.layoutTree) out.push('', '## Layout Tree', formatLayoutTree(c.layoutTree));
  if (c.images?.length) out.push('', '## Images', ...imagesSection(c.images, s));
  out.push('', '## States', states, '', '## Motion', ...motion);
  if (c.responsive) out.push('', ...responsiveSection(c.responsive, s));
  if (c.accessibility) out.push('', ...accessibilitySection(c.accessibility, s));
  if (c.variants) {
    out.push('', '## Variants', c.variants.length
      ? table(['Variant', 'Uses', 'Differences from this one', 'Example'], c.variants.map(v => [v.name, String(v.count), v.differences.length ? v.differences.map(d => styleText(d.property, d.value, s)).join(', ') : 'same styles', code(v.selector)]))
      : '- No similar elements on this page.');
  }
  return out;
}

export const RESPONSIVE_NOTE = '- Read at each width with the page\'s own styles: values as rendered there, – where it is not set. Each width stands for its range, up to the next media query listed.';

/** How it changes by width: one row per part and property that differs, then the media queries. */
export function responsiveSection(r: Responsive, s: CaptureSettings): string[] {
  const widths = r.widths.map(w => `${w}px`);
  const queries = r.queries.length
    ? `- Media queries that style it: ${r.queries.map(q => code(q)).join(', ')}.`
    : '- No media query in the site\'s stylesheets styles it; the widths are common ones.';
  if (!r.changes.length) return ['## Responsive', `- Nothing in it changes at ${widths.slice(0, -1).join(', ')} and ${widths[widths.length - 1]}.`, queries];
  const value = (property: string, v: string | null) => (v === null ? '–' : property === 'shown' ? v : show({ computed: v }, kindOf(property), s));
  return [
    '## Responsive',
    table(['Part', 'Property', ...widths], r.changes.map(ch => [ch.part, ch.property, ...ch.values.map(v => value(ch.property, v))])),
    '', queries, RESPONSIVE_NOTE
  ];
}

export const SECTION_NOTE = '- Each component is described once, in its own file (listed under Components); this file places them. A button or field inside another component has its own file too, for its states. Text parts give their text style only, never the text.';

/** A section: its tokens, its structure as an outline, the component files it uses, accessibility. */
function sectionBody(c: SectionCapture, s: CaptureSettings): string[] {
  const tokens = c.tokens.length
    ? table(['Token', 'Value', 'Used for'], c.tokens.map(t => [code(t.token), kindOf(t.usedFor[0] ?? '') === 'color' ? formatColor(t.value, s) : formatLength(t.value, s), t.usedFor.join(', ')]))
    : '- The section uses no custom properties of its own.';
  const structure = c.structure.map(n => {
    const indent = '  '.repeat(n.depth);
    const name = `${n.part}${n.count && n.count > 1 ? ` ×${n.count}` : ''} — ${n.element}`;
    if (n.component) {
      const variants = n.component.variants?.length
        ? `, ${n.component.variants.length === 1 ? 'variant' : 'variants in order:'} ${n.component.variants.map(code).join(', ')}`
        : '';
      return `${indent}- ${name} → component ${code(n.component.name)} (${code(n.component.file)})${variants}`;
    }
    const image = n.image ? `image slot ${sizeText(n.image.width, n.image.height, s)}, ${n.image.aspectRatio}` : '';
    const styles = n.styles.map(e => styleText(e.property, e.value, s)).join(', ');
    return `${indent}- ${name}: ${[image, styles].filter(Boolean).join('; ') || 'no styles of its own'}`;
  });
  const components = c.components.length
    ? table(['Component', 'Type', 'Uses here', 'Variants', 'File'], c.components.map(k => [code(k.name), k.type, `${k.count}${k.inside ? `, inside ${code(k.inside)}` : ''}`, String(k.variants), code(k.file)]))
    : '- No components inside: the structure describes everything.';
  const out = ['## Tokens', tokens, '', '## Structure', ...structure];
  if (c.layoutTree && s.layoutTree) out.push('', '## Layout Tree', formatLayoutTree(c.layoutTree));
  out.push('', SECTION_NOTE, '', '## Components', components);
  if (c.responsive) out.push('', ...responsiveSection(c.responsive, s));
  if (c.accessibility) out.push('', ...accessibilitySection(c.accessibility, s));
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
    ...components,
    ...(c.skipped?.length
      ? ['', '## Left out', '- Luci could not read these parts of the page, so they are not in this file:', ...c.skipped.map(x => `- ${x.part}: ${x.reason}`)]
      : [])
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
  if (c.meta.scope === 'section') return `${frontmatter(c.meta, settings)}\n\n${sectionBody(c as SectionCapture, settings).join('\n')}\n`;
  const body = key === 'page/page' ? pageBody(c as PageCapture, settings)
    : key === 'token/text' ? textToken(c as TextToken, settings)
    : key === 'token/color' ? ('colors' in c ? colorSet(c as ColorSet, settings) : colorToken(c as ColorToken, settings))
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
  const expected = meta.data.scope === 'component' ? COMPONENT_SECTIONS : meta.data.scope === 'section' ? SECTION_SECTIONS : CAPTURE_SECTIONS[`${meta.data.scope}/${meta.data.type}`];
  const missing = (expected ?? []).filter(h => !(h in sections));
  if (missing.length) return fail(`capture "${meta.data.name}" is missing sections: ${missing.join(', ')}`);
  return ok({ meta: meta.data, sections });
}
