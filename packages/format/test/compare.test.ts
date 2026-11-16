/**
 * Compare mode (v0.4): two captures, every value that differs as What, A, B; values compared by
 * meaning, as the design check compares them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compareCaptures, compareComponentFiles, formatCapture, formatCompareReport, type ComponentCapture, type Capture } from '../src/capture/index.js';

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/component-inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: ComponentCapture }>;
const inputs = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: Capture }>;
const button = fixtures['example-com.component.primary-button.design.md']!.capture;

/** The same button from another site: another blue (written in hex), rounder, no hover change of color. */
function otherButton(): ComponentCapture {
  const b: ComponentCapture = JSON.parse(JSON.stringify(button));
  b.meta = { ...b.meta, source: 'https://other.example/', name: 'buy-button' };
  const container = b.anatomy[0]!;
  container.styles = container.styles.map(s =>
    s.property === 'border-radius' ? { property: s.property, value: { computed: '12px' } }
    : s.property === 'background-color' ? { property: s.property, value: { computed: 'rgb(15, 98, 254)' } }
    : s);
  return b;
}

describe('compare captures (in the toolbar, any scope)', () => {
  it('lists only the values that differ, colors compared in any notation', () => {
    const r = compareCaptures(button, otherButton());
    expect(r.a.name).toBe('primary-button');
    expect(r.b.name).toBe('buy-button');
    expect(r.differences).toContainEqual({ what: 'container border-radius', a: '8px (--radius-md)', b: '12px' });
    // Same blue, one through a token: the same value
    expect(r.same).toContain('container background-color');
    expect(r.differences.some(d => d.what === 'container background-color')).toBe(false);
  });

  it('compares two of the same thing at other scopes too (a typography system against itself: no differences)', () => {
    const t = inputs['example-com.system.typography.design.md']!.capture;
    const r = compareCaptures(t, t);
    expect(r.differences).toEqual([]);
    expect(r.same.length).toBeGreaterThan(5);
  });

  it('writes a report: who is A and B, how many match, a table of differences', () => {
    const md = formatCompareReport(compareCaptures(button, otherButton()));
    expect(md).toMatch(/^# Compare: primary-button and buy-button\n- A: primary-button \(button\), from https:\/\/example\.com\//);
    expect(md).toContain('| What | A | B |');
    expect(md).toContain('| container border-radius | 8px (--radius-md) | 12px |');
  });

  it("keeps each side's note, on one line, so A and B can be told apart (the same button in light and dark mode)", () => {
    const light: ComponentCapture = { ...button, instructions: 'light-mode' };
    const dark: ComponentCapture = { ...otherButton(), instructions: 'dark-mode\n  version' };
    const r = compareCaptures(dark, light);
    expect(r.a.note).toBe('dark-mode version');
    expect(r.b.note).toBe('light-mode');
    expect(compareCaptures(button, otherButton()).a).not.toHaveProperty('note');
    const md = formatCompareReport(r);
    expect(md).toContain('- A: buy-button (button), from https://other.example/. Your note: dark-mode version\n');
    expect(md).toContain('- B: primary-button (button), from https://example.com/pricing. Your note: light-mode\n');
  });
});

describe('compare component files (command line and MCP)', () => {
  it('reads both files and lists the differences part by part', () => {
    const r = compareComponentFiles(formatCapture(button), formatCapture(otherButton()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.differences).toContainEqual({ what: 'container border-radius', a: '8px (--radius-md)', b: '12px' });
    expect(compareComponentFiles(formatCapture(button), formatCapture(button)).ok && compareComponentFiles(formatCapture(button), formatCapture(button))).toMatchObject({ value: { differences: [] } });
  });

  it('keeps the notes saved in the files ("Your instructions")', () => {
    const r = compareComponentFiles(formatCapture({ ...button, instructions: 'dark-mode' }), formatCapture(otherButton()));
    expect(r.ok && r.value.a.note).toBe('dark-mode');
    expect(r.ok && r.value.b).not.toHaveProperty('note');
  });

  it('says which file is not a component capture', () => {
    const r = compareComponentFiles('# not a capture', formatCapture(button));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^The first file is not a component capture/);
  });
});
