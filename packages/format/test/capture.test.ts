import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  captureFileName,
  cleanSource,
  collectionFileName,
  collectionSchema,
  componentSchema,
  formatCollection,
  parseCollection,
  withInstructions,
  type Collection,
  colorKey,
  formatCapture,
  formatColor,
  formatLength,
  isTransparent,
  parseCapture,
  pxValue,
  siteSlug,
  spacingSetSchema,
  textTokenSchema,
  typographySystemSchema,
  type Capture,
  type CaptureSettings
} from '@luci/format/capture';
import { parseFrontmatter } from '@luci/format';

const dir = fileURLToPath(new URL('../fixtures/capture/', import.meta.url));
const inputs = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8')) as Record<string, { capture: Capture; settings: CaptureSettings }>;

describe('capture files: golden files are the spec (M4.1)', () => {
  for (const [file, { capture, settings }] of Object.entries(inputs)) {
    it(file, () => {
      const golden = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      expect(captureFileName(capture.meta)).toBe(file);
      expect(formatCapture(capture, settings)).toBe(golden);
      const parsed = parseCapture(golden);
      expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    });
  }
});

const componentInputs = JSON.parse(fs.readFileSync(path.join(dir, 'component-inputs.json'), 'utf8')) as Record<string, { capture: Capture; settings: CaptureSettings }>;
const collectionInputs = JSON.parse(fs.readFileSync(path.join(dir, 'collection-inputs.json'), 'utf8')) as Record<string, { collection: Collection; settings: CaptureSettings }>;

describe('component and collection files: golden files are the spec (M5.1)', () => {
  for (const [file, { capture, settings }] of Object.entries(componentInputs)) {
    it(file, () => {
      const golden = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      expect(captureFileName(capture.meta)).toBe(file);
      expect(formatCapture(capture, settings)).toBe(golden);
      const parsed = parseCapture(golden);
      expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    });
  }
  for (const [file, { collection, settings }] of Object.entries(collectionInputs)) {
    it(file, () => {
      const golden = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      expect(collectionFileName(collection.name)).toBe(file);
      expect(formatCollection(collection, settings)).toBe(golden);
      const parsed = parseCollection(golden);
      expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
      if (!parsed.ok) return;
      // Items from both sites, grouped by type, each with its own source; no query strings
      expect(parsed.value.sources).toEqual(['https://example.com/pricing', 'https://shop.example.org/']);
      expect(parsed.value.groups).toEqual({ Components: ['Signup button'], Text: ['Shop heading'], Colors: ['Example accent'] });
    });
  }

  it('example-com.page.pricing.design.md: the full-page reference (user request, 2026-11-13)', () => {
    const file = 'example-com.page.pricing.design.md';
    const sys = (k: string) => inputs[`example-com.system.${k}.design.md`]!.capture;
    const page = {
      meta: { name: 'pricing', scope: 'page', type: 'page', source: 'https://www.example.com/pricing', captured: '2026-11-12', method: 'measured' },
      typography: sys('typography'), color: sys('color'), spacing: sys('spacing'),
      components: [componentInputs['example-com.component.primary-button.design.md']!.capture, componentInputs['example-com.component.nav-link.design.md']!.capture]
    } as unknown as Capture;
    const golden = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    expect(captureFileName(page.meta)).toBe(file);
    expect(formatCapture(page, {})).toBe(golden);
    const parsed = parseCapture(golden);
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.value.sections)).toEqual(['Typography', 'Colors', 'Spacing', 'Components']);
    // A page with none of a system says so; a page file is rejected without its sections
    expect(formatCapture({ ...page, typography: null, components: [] } as Capture, {})).toContain('## Typography\n- The page has no visible text.');
    expect(parseCapture(golden.replace('## Components', '## Parts')).ok).toBe(false);
    // In a basket export it is its own group, its headings one level down
    const collection = formatCollection({ name: 'one-page', captured: '2026-11-12', items: [{ id: '1', name: 'Pricing page', addedAt: '2026-11-12', capture: page }] }, {});
    expect(parseCollection(collection).ok).toBe(true);
    expect(collection).toContain('# Pages\n\n## Pricing page');
    expect(collection).toContain('\n#### primary-button\n');
    expect(collection).toContain('\n##### States\n');
  });

  it('the spec rejects a spacing set without values or with a distance', () => {
    const set = inputs['example-com.token.spacing-ul.design.md']!.capture as unknown as { values: object[] };
    expect(spacingSetSchema.safeParse({ ...set, values: [] }).success).toBe(false);
    expect(spacingSetSchema.safeParse({ ...set, values: [{ value: { computed: '4px' }, kind: 'distance', property: 'x' }] }).success).toBe(false);
  });

  it('the spec rejects a component without parts, an unknown state, and an empty basket', () => {
    const button = componentInputs['example-com.component.primary-button.design.md']!.capture as unknown as Record<string, unknown>;
    expect(componentSchema.safeParse({ ...button, anatomy: [] }).success).toBe(false);
    expect(componentSchema.safeParse({ ...button, states: [{ state: 'visited', detected: true, changes: [] }] }).success).toBe(false);
    const basket = collectionInputs['two-sites.collection.design.md']!.collection;
    expect(collectionSchema.safeParse({ ...basket, items: [] }).success).toBe(false);
    expect(parseCollection('---\nscope: collection\nitems: 2\n---\n\n# Text\n\n## One\n').ok).toBe(false);
    expect(parseCapture('---\nname: x\nscope: component\ntype: button\nsource: https://a.b/\nselector: a\ncaptured: 2026-11-12\nmethod: measured\n---\n\n## Tokens\n').ok).toBe(false);
  });
});

describe('your instructions for the agent (user request, 2026-11-13)', () => {
  const base = inputs['example-com.token.color-primary.design.md']!.capture;

  it('are written word for word as the first section, and a "#" line cannot become a heading', () => {
    const text = formatCapture({ ...base, instructions: 'Use this as our primary color.\n## not a heading\nKeep the hover darker.' } as Capture);
    const body = text.split('---\n')[2]!.trimStart();
    expect(body.startsWith('## Your instructions\nUse this as our primary color.\n\\## not a heading\nKeep the hover darker.\n\n## Color')).toBe(true);
    const parsed = parseCapture(text);
    expect(parsed.ok && Object.keys(parsed.value.sections)).toEqual(['Your instructions', 'Color', 'Where used']);
    // Without instructions the file is exactly the measured one
    expect(formatCapture(base)).toBe(fs.readFileSync(path.join(dir, 'example-com.token.color-primary.design.md'), 'utf8').replace(/\r\n/g, '\n'));
  });

  it('can be set, replaced or removed in a file edited by hand, keeping the edits', () => {
    const edited = formatCapture(base).replace('| accent |', '| brand accent |');
    const once = withInstructions(edited, 'First version');
    expect(once).toContain('## Your instructions\nFirst version\n\n## Color');
    const twice = withInstructions(once, 'Second version');
    expect(twice).not.toContain('First version');
    expect(twice).toContain('| brand accent |');
    expect(withInstructions(twice, '')).toBe(edited);
  });

  it('a basket export uses an item\'s edited text', () => {
    const basket = collectionInputs['two-sites.collection.design.md']!.collection;
    const items = basket.items.map((item, i) => (i === 2 ? { ...item, edited: '---\nname: x\n---\n\n## Color\nMy own note on this color.\n' } : item));
    const out = formatCollection({ ...basket, items });
    expect(out).toContain('### Color\nMy own note on this color.');
    expect(parseCollection(out).ok).toBe(true);
  });
});

describe('capture values and settings', () => {
  it('lengths in px, rem or both; keywords and lists', () => {
    expect(formatLength('16px')).toBe('16px');
    expect(formatLength('16px', { units: 'rem' })).toBe('1rem');
    expect(formatLength('12px 20px', { units: 'both' })).toBe('12px 20px (0.75rem 1.25rem)');
    expect(formatLength('0px', { units: 'rem' })).toBe('0');
    expect(formatLength('20px', { units: 'rem', rootFontSize: 10 })).toBe('2rem');
    expect(formatLength('normal', { units: 'both' })).toBe('normal');
    expect(formatLength('15.999px')).toBe('15.999px');
    expect(pxValue('24px')).toBe(24);
    expect(pxValue('auto')).toBeNull();
  });

  it('colors in hex, rgb, hsl or oklch; transparent and unknown values', () => {
    expect(formatColor('rgb(15, 98, 254)')).toBe('#0f62fe');
    expect(formatColor('#0f62fe', { colors: 'rgb' })).toBe('rgb(15, 98, 254)');
    expect(formatColor('rgb(15, 98, 254)', { colors: 'hsl' })).toMatch(/^hsl\(/);
    expect(formatColor('rgba(0, 0, 0, 0)')).toBe('transparent');
    expect(formatColor('currentcolor')).toBe('currentcolor');
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(colorKey('rgb(15, 98, 254)')).toBe(colorKey('#0F62FE'));
  });

  it('the source keeps no query or fragment, and names come from the host', () => {
    expect(cleanSource('https://shop.example.com/a/b?token=secret#x')).toBe('https://shop.example.com/a/b');
    expect(siteSlug('https://www.Example.co.uk/x')).toBe('example-co-uk');
    expect(siteSlug('file:///C:/site/index.html')).toBe('local');
  });

  it('selectors that YAML would misread are quoted and read back the same', () => {
    const base = inputs['example-com.token.color-primary.design.md']!.capture;
    for (const selector of ['#app > .cta', 'a[href="/x"]', 'div: odd', 'true']) {
      const text = formatCapture({ ...base, meta: { ...base.meta, selector } } as Capture);
      expect(parseFrontmatter(text).data['selector']).toBe(selector);
    }
  });

  it('schemas reject what the spec does not allow', () => {
    const text = inputs['example-com.token.text-heading-1.design.md']!.capture as unknown as Record<string, unknown> & { meta: Record<string, unknown> };
    expect(textTokenSchema.safeParse({ ...text, meta: { ...text.meta, name: 'Heading 1' } }).success).toBe(false);
    expect(textTokenSchema.safeParse({ ...text, meta: { ...text.meta, captured: '12/11/2026' } }).success).toBe(false);
    const typo = inputs['example-com.system.typography.design.md']!.capture as unknown as Record<string, unknown> & { meta: Record<string, unknown> };
    expect(typographySystemSchema.safeParse({ ...typo, meta: { ...typo.meta, selector: 'main' } }).success).toBe(false);
    expect(typographySystemSchema.safeParse({ ...typo, roles: [] }).success).toBe(false);
    expect(parseCapture('# no frontmatter').ok).toBe(false);
    expect(parseCapture('---\nname: x\nscope: token\ntype: color\nsource: https://a.b/\ncaptured: 2026-11-12\nmethod: measured\n---\n\n## Color\n').ok).toBe(false);
  });
});
