/**
 * DESIGN.md for Google Stitch: captures in the open DESIGN.md format (google-labs-code/design.md,
 * version alpha): YAML front matter with tokens, the spec's sections in its order, filled in from
 * measured values only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatStitch, type Capture, type ComponentCapture } from '../src/capture/index.js';

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/component-inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: ComponentCapture }>;
const inputs = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: Capture }>;
const button = fixtures['example-com.component.primary-button.design.md']!.capture;
const systems = ['example-com.system.color.design.md', 'example-com.system.typography.design.md', 'example-com.system.spacing.design.md'].map(f => inputs[f]!.capture);

/** The front matter between the first two "---" lines. */
const frontMatter = (md: string) => md.split('\n---\n')[0]!.replace(/^---\n/, '');
const SECTION_ORDER = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', 'Do\'s and Don\'ts'];

describe('DESIGN.md (Stitch) from a basket', () => {
  const md = formatStitch([...systems, button]);

  it('starts with YAML front matter: version alpha, a name, and the token groups', () => {
    expect(md).toMatch(/^---\nversion: alpha\nname: Example design\ndescription: "Exported by Luci from 4 captures of example\.com/);
    const fm = frontMatter(md);
    expect(fm).toMatch(/\ncolors:\n {2}primary: "#[0-9a-f]{6}"\n/);
    expect(fm).toContain('\ntypography:\n  display:\n    fontFamily: Inter\n    fontSize: 48px\n    fontWeight: "700"\n    lineHeight: 56px\n    letterSpacing: -0.96px\n');
    expect(fm).toMatch(/\nspacing:\n {2}unit: 4px\n/);
    // Each spacing value once, by its token or its value
    expect(fm).not.toMatch(/space-\d+-\d+/);
    expect(fm).toContain('\ncomponents:\n  primary-button:\n    backgroundColor: "{colors.');
    // References point at keys that exist
    for (const ref of fm.matchAll(/"\{(colors|typography|rounded)\.([\w-]+)\}"/g)) {
      expect(fm, ref[0]).toMatch(new RegExp(`\\n${ref[1]}:\\n(?: {2}[^\\n]*\\n| {4}[^\\n]*\\n)*? {2}${ref[2]}:`));
    }
  });

  it('writes a hover variant as its own component, with what changes', () => {
    expect(frontMatter(md)).toMatch(/\n {2}primary-button-hover:\n {4}backgroundColor: "\{colors\.[\w-]+\}"/);
  });

  it('keeps the spec\'s section order, and only sections it has something for', () => {
    const sections = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    expect(sections).toEqual(SECTION_ORDER.filter(s => sections.includes(s)));
    expect(sections.slice(0, 4)).toEqual(['Overview', 'Colors', 'Typography', 'Layout']);
    expect(sections).toContain('Components');
  });

  it('writes the prose from measured values: colors with roles, type styles, the base unit, the component', () => {
    expect(md).toMatch(/- \*\*Primary \(#[0-9a-f]{6}\):\*\* an accent, used \d+ times? for /);
    expect(md).toContain('- **Display:** Inter 48px, weight 700, line height 56px, letter spacing -0.96px; used by h1.');
    expect(md).toMatch(/- Spacing follows a \dpx base unit: /);
    expect(md).toContain('### Primary Button\nA button (');
    expect(md).toMatch(/On hover, background-color becomes #[0-9a-f]{6}\./);
    expect(md).toContain('nothing is invented');
  });
});

describe('many captures at once', () => {
  const all = [...Object.values(inputs).map(x => x.capture), ...Object.values(fixtures).map(x => x.capture)];
  const md = formatStitch(all);

  it('names each spacing value once, in px order in the prose', () => {
    const values = [...frontMatter(md).split('\nspacing:\n')[1]!.split('\ncomponents:')[0]!.matchAll(/^ {2}([\w-]+): (\S+)$/gm)].filter(m => m[1] !== 'unit').map(m => m[2]);
    expect(new Set(values).size).toBe(values.length);
    const listed = /- Spacing follows a \dpx base unit: ([^.\n]+)\./.exec(md)![1]!.split(', ').map(v => parseFloat(v));
    expect(listed).toEqual([...listed].sort((a, b) => a - b));
  });

  it('never writes a source\'s query or fragment', () => {
    expect(md).not.toMatch(/[?#]ref=|#plans/);
  });
});

describe('a single capture', () => {
  it('a lone component still defines primary (the spec\'s one required color)', () => {
    const md = formatStitch([button]);
    expect(frontMatter(md)).toMatch(/\ncolors:\n {2}primary: "#[0-9a-f]{6}"/);
    expect(frontMatter(md)).toContain('backgroundColor: "{colors.primary}"');
  });

  it('the person\'s own notes go into the Overview word for word', () => {
    const md = formatStitch([{ ...button, instructions: 'Use this for every checkout button.' }]);
    expect(md).toContain('- Primary Button: Use this for every checkout button.');
  });
});
