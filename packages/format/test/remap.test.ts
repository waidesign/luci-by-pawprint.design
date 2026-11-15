/**
 * Remap to my tokens (v0.4): a capture rewritten onto the person's own tokens in one step.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCapture, parseCapture, parseTokens, remapCapture, remapSummary, type Capture, type ComponentCapture } from '../src/capture/index.js';

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/component-inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: ComponentCapture }>;
const inputs = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/capture/inputs.json', import.meta.url)), 'utf8')) as Record<string, { capture: Capture }>;
const button = fixtures['example-com.component.primary-button.design.md']!.capture;

// The person's own tokens: the same blue under their name, a 12px spacing token, their radius scale
const MINE = `
:root {
  --blue-500: #0f62fe;
  --action: var(--blue-500);
  --space-3: 12px;
  --space-5: 1.25rem;
  --radius-sm: 4px;
  --font-body: "Inter", sans-serif;
}`;

describe('reading the person\'s tokens', () => {
  it('reads custom properties from pasted CSS, with or without a rule around them, resolved through each other', () => {
    expect(parseTokens(MINE)).toContainEqual({ token: '--action', value: '#0f62fe' });
    expect(parseTokens('--brand: red; --text: var(--brand);')).toEqual([{ token: '--brand', value: 'red' }, { token: '--text', value: 'red' }]);
  });
});

describe('remapping a capture', () => {
  const { capture, report } = remapCapture(button, parseTokens(MINE));
  const style = (part: string, property: string) => capture.anatomy.find(p => p.part === part)!.styles.find(s => s.property === property)!.value;

  it('writes a value one of their tokens holds through it (a name for the role wins)', () => {
    expect(style('container', 'background-color')).toEqual({ computed: 'rgb(15, 98, 254)', authored: 'var(--blue-500)', token: '--blue-500' });
    expect(report.matched).toContainEqual({ what: 'container background-color', token: '--blue-500', value: 'rgb(15, 98, 254)' });
  });

  it('maps a shorthand word by word, lengths only onto tokens named for their kind', () => {
    // padding 12px 20px: both are spacing tokens of theirs (20px = 1.25rem)
    expect(style('container', 'padding')).toEqual({ computed: '12px 20px', authored: 'var(--space-3) var(--space-5)' });
    // The site's 8px radius: they have no 8px radius token, so it stays 8px and loses the site's --radius-md
    expect(style('container', 'border-radius')).toEqual({ computed: '8px' });
    expect(report.unmatched).toContainEqual({ what: 'container border-radius', value: '8px' });
  });

  it('lists their tokens it uses, and never the site\'s', () => {
    expect(capture.tokens.map(t => t.token).sort()).toEqual(expect.arrayContaining(['--blue-500', '--space-3', '--space-5']));
    expect(JSON.stringify(capture)).not.toContain('--color-primary');
    expect(JSON.stringify(capture)).not.toContain('--radius-md');
    // The original is not changed
    expect(JSON.stringify(button)).toContain('--color-primary');
  });

  it('is still a capture file Luci reads', () => {
    const md = formatCapture(capture);
    expect(parseCapture(md).ok).toBe(true);
    expect(md).toContain('--blue-500');
  });

  it('says in one line what it did', () => {
    expect(remapSummary(report)).toMatch(/^\d+ of \d+ values now use your tokens\. \d+ have no token of yours: /);
  });
});

describe('other scopes', () => {
  it('remaps a color system onto their color tokens', () => {
    const sys = inputs['example-com.system.color.design.md']!.capture;
    const { capture } = remapCapture(sys, parseTokens(MINE));
    if (!('tokens' in capture) || !('roles' in capture)) throw new Error('not a color system');
    expect(capture.tokens.map(t => t.token)).toEqual(['--blue-500', '--action']);
    expect(JSON.stringify(capture.tokens)).not.toContain('--color-primary');
  });

  it('remaps a text style\'s family onto their font token', () => {
    const text = inputs['example-com.token.text-heading-1.design.md']!.capture;
    // The site's Inter (through its --font-sans) is their --font-body: the same first family
    const { capture } = remapCapture(text, [{ token: '--font-body', value: '"Inter", sans-serif' }]);
    if (!('style' in capture)) throw new Error('not a text style');
    expect(capture.style.family).toEqual({ computed: 'Inter, system-ui, sans-serif', authored: 'var(--font-body)', token: '--font-body' });
  });
});
