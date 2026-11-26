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

describe('B-30: stitch export respects settings and cleans invalid/estimated values', () => {
  it('respects source: site, omits invalid initial colors, handles large-text contrast, skips estimated fails, and counts grid columns correctly', () => {
    const comp: ComponentCapture = {
      ...button,
      meta: {
        ...button.meta,
        source: 'https://classicdecoder.com/page?query=1#hash'
      },
      states: [
        {
          state: 'hover',
          detected: true,
          changes: [
            { property: 'background-color', part: 'container', from: 'rgb(0, 0, 0)', to: { computed: 'initial' } },
            { property: 'transform', part: 'container', from: 'none', to: { computed: 'matrix(1, 0, 0, 1, 0, -12)' } }
          ]
        }
      ],
      accessibility: {
        contrast: [
          { text: 'rgb(255, 255, 255)', background: 'rgb(100, 100, 100)', ratio: 3.5, level: 'fail', large: true },
          { text: 'rgb(200, 200, 200)', background: 'rgb(255, 255, 255)', ratio: 1.5, level: 'fail', large: false, estimated: true }
        ]
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sec: any = {
      meta: { name: 'hero-grid', scope: 'section', type: 'section', source: 'https://classicdecoder.com/page' },
      structure: [
        {
          element: 'div',
          styles: [
            { property: 'display', value: { computed: 'grid' } },
            { property: 'grid-template-columns', value: { computed: 'minmax(0, 1fr) 200px' } }
          ]
        }
      ],
      components: []
    };

    const md = formatStitch([comp, sec], { settings: { source: 'site' } });
    expect(md).toContain('classicdecoder.com');
    expect(md).not.toContain('https://classicdecoder.com');
    expect(md).not.toContain('initial');
    expect(md).toContain('translateY(-12px)');
    expect(md).not.toContain('matrix(');
    expect(md).toContain('under the 3:1 AA needs');
    expect(md).not.toContain('200, 200, 200');
    expect(md).toContain('of 2 columns');
  });

  it('respects Smart units: rem for text and spacing, px for border-radius/borders, and preserves authored %/vw widths', () => {
    const comp: Capture = {
      meta: { name: 'card', scope: 'component', type: 'card', source: 'https://example.com/', selector: '.card', captured: '2026-11-21', method: 'measured' },
      tokens: [],
      anatomy: [
        {
          part: 'container', element: 'div',
          styles: [
            { property: 'padding', value: { computed: '16px 24px' } },
            { property: 'border-radius', value: { computed: '8px' } },
            { property: 'border', value: { computed: '1px solid rgb(229, 231, 235)' } },
            { property: 'width', value: { computed: '640px', authored: '100%' } }
          ]
        },
        {
          part: 'heading', element: 'h2',
          styles: [
            { property: 'font-family', value: { computed: 'Inter, sans-serif' } },
            { property: 'font-size', value: { computed: '32px' } },
            { property: 'font-weight', value: { computed: '600' } },
            { property: 'line-height', value: { computed: '40px' } },
            { property: 'color', value: { computed: 'rgb(17, 24, 39)' } }
          ]
        }
      ],
      states: [],
      motion: []
    };
    const md = formatStitch([comp], { settings: { units: 'smart' } });
    expect(md).toContain('fontSize: 2rem');
    expect(md).toContain('lineHeight: 2.5rem');
    expect(md).toContain('r-8: 8px');
    expect(md).toContain('padding: "1rem 1.5rem"');
    expect(md).toContain('width: "100%"');
    expect(md).toContain('8px corners, 1rem 1.5rem padding, a 1px solid #e5e7eb border');
    expect(md).toContain('Its label is Inter 2rem, weight 600.');
  });
});
