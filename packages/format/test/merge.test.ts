import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  captureFileName,
  captureSchema,
  formatCapture,
  mergeGroups,
  mergeSystems,
  parseCapture,
  type Capture,
  type CaptureSettings,
  type ColorSystem,
  type SpacingSystem,
  type SystemCapture,
  type TypographySystem
} from '@luci/format/capture';

const captureDir = fileURLToPath(new URL('../fixtures/capture/', import.meta.url));
const mergeDir = fileURLToPath(new URL('../fixtures/merge/', import.meta.url));
const text = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const pageInputs = JSON.parse(text(path.join(captureDir, 'inputs.json'))) as Record<string, { capture: Capture }>;
const mergeInputs = JSON.parse(text(path.join(mergeDir, 'inputs.json'))) as Record<string, { settings: CaptureSettings; base: string; others: SystemCapture[] }>;
const inputsFor = (name: string) => [pageInputs[mergeInputs[name]!.base]!.capture as SystemCapture, ...mergeInputs[name]!.others];

describe('multi-page system merge: the golden files are the spec (v0.3.3)', () => {
  for (const [name, { settings }] of Object.entries(mergeInputs)) {
    it(`${name}: /pricing and /blog in one site-level file`, () => {
      const merged = mergeSystems(inputsFor(name), { captured: '2026-11-14' });
      expect(captureFileName(merged.meta)).toBe(name);
      expect(captureSchema.safeParse(merged).success).toBe(true);
      const golden = text(path.join(mergeDir, name));
      expect(formatCapture(merged, settings)).toBe(golden);
      // A capture file Luci reads back (saved into a project like any other)
      const parsed = parseCapture(golden);
      expect(parsed.ok && parsed.value.sections['Conflicts']).toBeTruthy();
    });
  }

  it('unifies by what a row is: summed uses, the pages of each row, conflicts per role and token', () => {
    const type = mergeSystems(inputsFor('example-com.system.site-typography.design.md')) as TypographySystem;
    expect(type.meta).toMatchObject({ source: 'https://example.com/', pages: ['https://example.com/pricing', 'https://example.com/blog'] });
    // Body is the same style on both pages (its font stack written differently): one role
    expect(type.roles.find(r => r.role === 'body')).toMatchObject({ count: 64, elements: ['p', 'li'], pages: ['https://example.com/pricing', 'https://example.com/blog'] });
    expect(type.families).toEqual([{ family: '"Inter", system-ui, sans-serif', count: 79 }, { family: '"JetBrains Mono", monospace', count: 2 }]);
    expect(type.conflicts?.map(c => c.what)).toEqual(['role heading-2']);

    const color = mergeSystems(inputsFor('example-com.system.site-color.design.md')) as ColorSystem;
    expect(color.roles.find(r => r.role === 'text')!.count).toBe(80);
    expect(color.conflicts).toEqual([{ what: 'token --color-primary', values: [
      { value: 'rgb(15, 98, 254)', pages: ['https://example.com/pricing'] },
      { value: 'rgb(0, 67, 206)', pages: ['https://example.com/blog'] }
    ] }]);

    const spacing = mergeSystems(inputsFor('example-com.system.site-spacing.design.md')) as SpacingSystem;
    expect(spacing.baseUnit).toEqual({ px: 4, share: 0.96 });
    expect(spacing.outliers.map(o => o.value.computed)).toEqual(['3px', '10px']);
    expect(spacing.conflicts?.map(c => c.what)).toEqual(['token --space-4']);
  });

  it('a site-level system merges again with another page', () => {
    const site = mergeSystems(inputsFor('example-com.system.site-color.design.md')) as ColorSystem;
    const contact = { ...mergeInputs['example-com.system.site-color.design.md']!.others[0]!, meta: { ...site.meta, source: 'https://example.com/contact', pages: undefined } } as ColorSystem;
    const again = mergeSystems([site, contact]) as ColorSystem;
    expect(again.meta.pages).toEqual(['https://example.com/pricing', 'https://example.com/blog', 'https://example.com/contact']);
    expect(again.roles.find(r => r.role === 'text')!.pages).toHaveLength(3);
  });

  it('refuses systems of different kinds or sites, or a single page', () => {
    const typo = pageInputs['example-com.system.typography.design.md']!.capture as SystemCapture;
    const color = pageInputs['example-com.system.color.design.md']!.capture as SystemCapture;
    expect(() => mergeSystems([typo, color])).toThrow(/one kind of system/);
    expect(() => mergeSystems([typo, { ...typo, meta: { ...typo.meta, source: 'https://other.org/a' } } as SystemCapture])).toThrow(/one site/);
    expect(() => mergeSystems([typo, typo])).toThrow(/two pages or more/);
  });
});

describe('which basket items can merge', () => {
  it('single-page systems of one type and site, two pages or more; a page captured twice counts once, the latest', () => {
    const typo = pageInputs['example-com.system.typography.design.md']!.capture as SystemCapture;
    const blog = mergeInputs['example-com.system.site-typography.design.md']!.others[0]!;
    const color = pageInputs['example-com.system.color.design.md']!.capture as SystemCapture;
    const items = [
      { id: 'a', capture: typo }, { id: 'b', capture: blog }, { id: 'c', capture: { ...typo, meta: { ...typo.meta, captured: '2026-11-14' } } as Capture },
      { id: 'd', capture: color }, { id: 'e', capture: { ...blog, meta: { ...blog.meta, source: 'https://www.other.org/' } } as Capture },
      { id: 'f', capture: mergeSystems([typo, blog]) }
    ];
    expect(mergeGroups(items).map(g => ({ site: g.site, type: g.type, items: g.items.map(i => i.id), pages: g.pages }))).toEqual([
      { site: 'example.com', type: 'typography', items: ['c', 'b'], pages: ['https://example.com/pricing', 'https://example.com/blog'] }
    ]);
  });
});
