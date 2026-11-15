import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  extractTokens,
  formatCssVariables,
  formatTailwind,
  formatTailwindV3,
  CSS_VARS_FILE_NAME,
  TAILWIND_V4_FILE_NAME,
  TAILWIND_V3_FILE_NAME,
  type Capture,
  type ComponentCapture
} from '../src/capture/index.js';

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/capture/component-inputs.json', import.meta.url)), 'utf8')
) as Record<string, { capture: ComponentCapture }>;

const inputs = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/capture/inputs.json', import.meta.url)), 'utf8')
) as Record<string, { capture: Capture }>;

const button = fixtures['example-com.component.primary-button.design.md']!.capture;
const systems = ['example-com.system.color.design.md', 'example-com.system.typography.design.md', 'example-com.system.spacing.design.md'].map(
  f => inputs[f]!.capture
);

describe('Token extraction', () => {
  it('extracts colors, fonts, text styles, and spacing from systems and components', () => {
    const tokens = extractTokens([...systems, button]);
    expect(tokens.colors.size).toBeGreaterThan(0);
    expect(tokens.colors.has('primary')).toBe(true);
    expect(tokens.textStyles.size).toBeGreaterThan(0);
    expect(tokens.spacing.size).toBeGreaterThan(0);
  });
});

describe('CSS Variables export (:root)', () => {
  it('formats clean standard CSS with :root and custom properties', () => {
    const css = formatCssVariables([...systems, button], { name: 'Acme Design' });
    expect(css).toContain(':root {');
    expect(css).toContain('/* Colors */');
    expect(css).toMatch(/--color-primary: #[0-9a-f]{6};/i);
    expect(css).toContain('/* Typography */');
    expect(css).toContain('/* Spacing */');
    expect(css).toContain('}');
    expect(CSS_VARS_FILE_NAME).toBe('tokens.css');
  });
});

describe('Tailwind CSS v4 export (@theme)', () => {
  it('formats modern Tailwind v4 @theme block', () => {
    const theme = formatTailwind([...systems, button], { name: 'Acme Theme' });
    expect(theme).toContain('@theme {');
    expect(theme).toMatch(/--color-primary: #[0-9a-f]{6};/i);
    expect(theme).toMatch(/--spacing-/);
    expect(theme).toContain('}');
    expect(TAILWIND_V4_FILE_NAME).toBe('theme.css');
  });
});

describe('Tailwind CSS v3 export (tailwind.config.js)', () => {
  it('formats valid JS config extending theme', () => {
    const js = formatTailwindV3([...systems, button], { name: 'Acme Config' });
    expect(js).toContain('module.exports = {');
    expect(js).toContain('extend: {');
    expect(js).toContain('"colors": {');
    expect(js).toContain('"primary": "#');
    expect(js).toContain('"spacing": {');
    expect(TAILWIND_V3_FILE_NAME).toBe('tailwind.config.js');
  });
});
