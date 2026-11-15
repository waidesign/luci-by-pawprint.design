import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkComponent,
  formatCapture,
  formatCheckReport,
  readComponentFile,
  readStyles,
  readValue,
  sameValue,
  type Capture,
  type CaptureSettings,
  type ComponentCapture,
  type ComponentSpec
} from '@luci-dev/format/capture';
import { feedbackItemSchema } from '@luci-dev/format/feedback';

const captureDir = fileURLToPath(new URL('../fixtures/capture/', import.meta.url));
const checkDir = fileURLToPath(new URL('../fixtures/check/', import.meta.url));
const text = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const spec = (markdown: string): ComponentSpec => {
  const r = readComponentFile(markdown);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const componentInputs = Object.fromEntries(Object.entries(JSON.parse(text(path.join(captureDir, 'component-inputs.json'))) as Record<string, { capture: Capture; settings: CaptureSettings }>)
  .filter(([, v]) => v.capture.meta.scope === 'component'));

describe('design check: the golden report is the spec (v0.3.1)', () => {
  it('the built button against the primary-button design gives the reviewed report', () => {
    const design = spec(text(path.join(captureDir, 'example-com.component.primary-button.design.md')));
    const built = spec(text(path.join(checkDir, 'localhost-5173.component.primary-button.design.md')));
    const result = checkComponent(design, built, { knownTokens: ['--radius-md'] });
    const report = formatCheckReport(result, { selector: built.meta.selector!, page: built.meta.source, designFile: '.luci/design/example-com.component.primary-button.design.md' });
    expect(report).toBe(text(path.join(checkDir, 'primary-button.check.md')));
    expect(result.differences.map(d => d.kind)).toEqual(['token', 'style', 'style', 'style', 'part', 'state', 'state', 'state', 'motion', 'accessibility']);
    expect(result.differences.find(d => d.kind === 'accessibility')!.priority).toBe('high');
  });

  it('without the token on the built page, a value that matches is a match, not a difference', () => {
    const design = spec(text(path.join(captureDir, 'example-com.component.primary-button.design.md')));
    const built = spec(text(path.join(checkDir, 'localhost-5173.component.primary-button.design.md')));
    const result = checkComponent(design, built);
    expect(result.differences.some(d => d.kind === 'token')).toBe(false);
    expect(result.matches).toContain('container border-radius');
  });
});

describe('reading a component file back (v0.3.1)', () => {
  it('reads every component golden, and a file checked against itself has no differences', () => {
    for (const [file] of Object.entries(componentInputs)) {
      const s = spec(text(path.join(captureDir, file)));
      expect(s.parts[0]!.part).toBe('container');
      const result = checkComponent(s, s);
      expect(result.differences, file).toEqual([]);
      expect(result.matches.length, file).toBeGreaterThan(0);
    }
  });

  it('a file written with other unit and color settings means the same values', () => {
    const variants: CaptureSettings[] = [{ units: 'rem' }, { units: 'both' }, { colors: 'rgb' }, { colors: 'hsl' }, { colors: 'oklch', units: 'rem' }];
    for (const [file, { capture }] of Object.entries(componentInputs)) {
      const base = spec(formatCapture(capture));
      for (const settings of variants) {
        const other = spec(formatCapture(capture, settings));
        expect(checkComponent(base, other).differences, `${file} ${JSON.stringify(settings)}`).toEqual([]);
        expect(checkComponent(other, base).differences, `${file} ${JSON.stringify(settings)} reversed`).toEqual([]);
      }
    }
  });

  it('tells commas inside values from commas between properties', () => {
    expect(readStyles('font-family "Helvetica Neue", Arial, sans-serif, font-size 16px, box-shadow rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgba(0, 0, 0, 0.06) 0px 1px 3px 0px, color #111')).toEqual([
      { property: 'font-family', value: '"Helvetica Neue", Arial, sans-serif' },
      { property: 'font-size', value: '16px' },
      { property: 'box-shadow', value: 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgba(0, 0, 0, 0.06) 0px 1px 3px 0px' },
      { property: 'color', value: '#111' }
    ]);
    expect(readStyles('no styles of its own')).toEqual([]);
  });

  it('separates a value from its token, what the site wrote and its rem form', () => {
    expect(readValue('8px (`--radius-md`)')).toEqual({ value: '8px', token: '--radius-md' });
    expect(readValue('16px (`clamp(1rem, 2vw, 2rem)`)')).toEqual({ value: '16px' });
    expect(readValue('12px 20px (0.75rem 1.25rem)')).toEqual({ value: '12px 20px' });
    expect(readValue('12px (0.75rem) (`--space-3`)')).toEqual({ value: '12px', token: '--space-3' });
  });

  it('reads states from an element around it, motion with a curve and a delay, and states it could not read', () => {
    const capture = componentInputs['example-com.component.primary-button.design.md']!.capture as ComponentCapture;
    const changed: ComponentCapture = {
      ...capture,
      states: [
        { state: 'hover', detected: true, method: 'forced', trigger: { element: 'li (listitem)', selector: 'nav li', depth: 2 }, changes: [{ part: 'label', property: 'color', from: 'rgb(255, 255, 255)', to: { computed: 'rgb(0, 0, 0)' } }] },
        { state: 'focus', detected: false, method: 'rules', changes: [] },
        { state: 'active', detected: false, method: 'forced', changes: [] }
      ],
      motion: [{ part: 'label', kind: 'transition', target: 'color', duration: '0.2s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', delay: '0.1s' }]
    };
    const s = spec(formatCapture(changed));
    expect(s.states).toEqual([
      { state: 'hover', status: 'changes', trigger: 'li (listitem)', changes: [{ part: 'label', property: 'color', from: '#ffffff', to: '#000000' }] },
      { state: 'focus', status: 'unknown', changes: [] },
      { state: 'active', status: 'no-change', changes: [] }
    ]);
    expect(s.motion).toEqual([{ part: 'label', kind: 'transition', target: 'color', duration: '0.2s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', delay: '0.1s' }]);
  });

  it('says what to pick when the file is not a component', () => {
    const r = readComponentFile(text(path.join(captureDir, 'example-com.system.typography.design.md')));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/needs a component file/);
  });
});

describe('comparing values by meaning', () => {
  it('lengths within half a pixel, rem at the root size, colors in any notation, times, functions', () => {
    expect(sameValue('padding', '12px 20px', '0.75rem 1.25rem')).toBe(true);
    expect(sameValue('width', '12.4px', '12px')).toBe(true);
    expect(sameValue('width', '12.6px', '12px')).toBe(false);
    expect(sameValue('color', '#fff', 'rgb(255, 255, 255)')).toBe(true);
    expect(sameValue('color', 'oklch(62.8% 0.2577 29.23)', '#ff0000')).toBe(true);
    expect(sameValue('color', '#2563eb', '#0f62fe')).toBe(false);
    expect(sameValue('duration', '0.2s', '200ms')).toBe(true);
    expect(sameValue('transform', 'translateY(-2px)', 'translateY(-2.3px)')).toBe(true);
    expect(sameValue('transform', 'translateY(-2px)', 'scale(1.05)')).toBe(false);
    expect(sameValue('outline-offset', '0', '0px')).toBe(true);
    expect(sameValue('font-weight', '600', '700')).toBe(false);
    expect(sameValue('font-family', 'Inter, sans-serif', '"Inter", system-ui')).toBe(true);
    expect(sameValue('box-shadow', '#0000001a 0px 1px 2px 0px', '#0000001a 0px 1px 2px 0px, #0000000d 0px 1px 3px 0px')).toBe(false);
  });
});

describe('feedback items from a design check', () => {
  it('an item keeps what the design says and what was built', () => {
    const base = {
      id: 'itm-check-1', ref: 'P1-A1', page: { url: 'http://localhost:5173/', route: '/' },
      target: { kind: 'element', selector: 'button', element: 'button' }, comment: 'Its background-color is #2563eb; the design says #0f62fe.',
      intent: 'fix', priority: 'medium', status: 'pending', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:00:00.000Z', thread: []
    };
    const check = { design: 'x.design.md', part: 'container', state: 'hover', property: 'background-color', expected: '#0f62fe', actual: '#2563eb' };
    expect(feedbackItemSchema.safeParse({ ...base, check }).success).toBe(true);
    expect(feedbackItemSchema.safeParse({ ...base, check: { ...check, state: 'pressed' } }).success).toBe(false);
    expect(feedbackItemSchema.safeParse({ ...base, check: { ...check, expected: '' } }).success).toBe(false);
  });
});
