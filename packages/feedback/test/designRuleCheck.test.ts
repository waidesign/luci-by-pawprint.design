/// <reference lib="dom" />
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { detectNoteTopics, parseBaselineFiles } from '../src/designRuleCheck.js';

const BUTTON_CAPTURE = `---
name: primary-button
scope: component
type: button
source: https://example.com
captured: 2026-11-20
method: measured
---

## Tokens
- None.

## Anatomy
- container — button: background-color #ec862b, color #2b2b2b, font-size 16px, border-radius 12px, padding 12px 24px

## States
| State | Changes |
| --- | --- |
| hover | No change |

## Motion
- None.
`;

const TYPO_BASELINE = `---
name: typography
scope: system
type: typography
source: file:///project
captured: 2026-11-20
method: authored
---

## Families
| Family | Uses |
| --- | --- |
| Inter | 10 |

## Scale
| Size | Token | Uses |
| --- | --- | --- |
| 14px | \`--text-sm\` | 4 |
| 16px | \`--text-md\` | 8 |
| 24px | \`--text-lg\` | 2 |
`;

const COLOR_BASELINE = `---
name: color
scope: system
type: color
source: file:///project
captured: 2026-11-20
method: authored
---

## Roles
| Role | Value | Authored | Token | Uses | Properties |
| --- | --- | --- | --- | --- | --- |
| primary | #ec862b | | \`--brand\` | 4 | background-color |
| ink | #2b2b2b | | \`--ink\` | 8 | color |
`;

describe('Team Feedback design-rule check (component captures + baseline tokens)', { timeout: 60_000 }, () => {
  let browser: Browser;
  let bundle: string;

  beforeAll(async () => {
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
    const built = build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'LuciFeedback', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
    [browser, bundle] = await Promise.all([chromium.launch(), built.then(r => r.outputFiles[0]!.text)]);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('detects topics and parses baseline markdown tables', () => {
    expect(detectNoteTopics('Button text feels too small')).toEqual(['typography']);
    expect(detectNoteTopics('Make card corners rounder')).toEqual(['radius']);
    expect(detectNoteTopics('Fix typo in heading')).toEqual([]);

    const baseline = parseBaselineFiles([
      { file: 'project.system.typography.design.md', markdown: TYPO_BASELINE },
      { file: 'project.system.color.design.md', markdown: COLOR_BASELINE }
    ]);
    expect(baseline.fontSizes).toEqual(['14px', '16px', '24px']);
    expect(baseline.fontFamilies).toEqual(['Inter']);
    expect(baseline.colors.map(c => c.label)).toEqual(['#ec862b', '#2b2b2b']);
  });

  it('classifies notes as supports-rule, conflicts-rule, or no-rule against component captures and baseline', async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <button id="cta" style="background-color: #ec862b; color: #2b2b2b; font-size: 12px; border-radius: 12px; padding: 12px 24px;">Start free</button>
        <p id="sub" style="color: #999999; font-size: 16px;">Subtext</p>
      </main>
    `);
    await page.addScriptTag({ content: bundle });

    const res = await page.evaluate(async ([btnMd, typoMd, colorMd]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).LuciFeedback;
      const backend = {
        kind: 'project',
        listCaptures: async () => [
          { file: 'example.component.primary-button.design.md', name: 'primary-button', scope: 'component', type: 'button', source: 'https://example.com' },
          { file: 'project.system.typography.design.md', name: 'typography', scope: 'system', type: 'typography', source: 'file:///project' },
          { file: 'project.system.color.design.md', name: 'color', scope: 'system', type: 'color', source: 'file:///project' }
        ],
        readCapture: async (file: string) => {
          if (file.includes('primary-button')) return btnMd;
          if (file.includes('typography')) return typoMd;
          return colorMd;
        }
      };
      const rules = await L.loadDesignRules(backend);
      const btn = document.querySelector('#cta')!;
      const sub = document.querySelector('#sub')!;

      // 1. Button font-size is 12px while component rule says 16px -> supports-rule
      const supportsComp = await L.assessNoteAgainstDesignRules(document, btn, 'Button text feels too small', rules);
      // 2. Button border-radius is 12px which matches component rule 12px -> conflicts-rule
      const conflictsComp = await L.assessNoteAgainstDesignRules(document, btn, 'Make button corners rounder', rules);
      // 3. Paragraph color #999999 is not in color baseline -> supports-rule
      const supportsBaseline = await L.assessNoteAgainstDesignRules(document, sub, 'Text contrast is too faint', rules);
      // 4. Paragraph font-size 16px IS in typography baseline -> conflicts-rule
      const conflictsBaseline = await L.assessNoteAgainstDesignRules(document, sub, 'Make this text size bigger', rules);
      // 5. Typo note has no style rule -> no-rule
      const noRule = await L.assessNoteAgainstDesignRules(document, sub, 'Fix typo in wording', rules);

      return { supportsComp, conflictsComp, supportsBaseline, conflictsBaseline, noRule };
    }, [BUTTON_CAPTURE, TYPO_BASELINE, COLOR_BASELINE] as const);

    expect(res.supportsComp.status).toBe('supports-rule');
    expect(res.supportsComp.detail).toContain('primary-button');
    expect(res.supportsComp.detail).toContain('font-size');
    expect(res.supportsComp.detail).toContain('16px');

    expect(res.conflictsComp.status).toBe('conflicts-rule');
    expect(res.conflictsComp.detail).toContain('primary-button');

    expect(res.supportsBaseline.status).toBe('supports-rule');
    expect(res.supportsBaseline.detail).toContain('project.system.color.design.md');

    expect(res.conflictsBaseline.status).toBe('conflicts-rule');
    expect(res.conflictsBaseline.detail).toContain('project.system.typography.design.md');

    expect(res.noRule.status).toBe('no-rule');
    await page.close();
  });
});
