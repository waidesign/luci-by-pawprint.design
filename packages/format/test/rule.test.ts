import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCapture, readComponentFile, ruleFromComponent, ruleText, type Capture, type ComponentSpec } from '@luci-dev/format/capture';
import { formatProposal, parseProposal } from '@luci-dev/format';

const captureDir = fileURLToPath(new URL('../fixtures/capture/', import.meta.url));
const ruleDir = fileURLToPath(new URL('../fixtures/rule/', import.meta.url));
const text = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const spec = (markdown: string): ComponentSpec => {
  const r = readComponentFile(markdown);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('capture to rule: the golden proposals are the spec (v0.3.2)', () => {
  for (const name of ['primary-button', 'card']) {
    it(`${name}: one line for rules.md that points at the file, with its key values and state changes`, () => {
      const file = `example-com.component.${name}.design.md`;
      const proposal = ruleFromComponent(spec(text(path.join(captureDir, file))), `.luci/design/${file}`);
      const golden = text(path.join(ruleDir, `${name}.proposal.md`));
      expect(formatProposal(proposal)).toBe(golden);
      // A proposal Luci's own reader accepts, meant for rules.md, on one line
      const parsed = parseProposal(golden);
      expect(parsed.ok && parsed.value.belongsIn).toBe('rules.md');
      expect(proposal.proposed).not.toContain('\n');
      expect(proposal.proposed).toContain(`\`.luci/design/${file}\``);
    });
  }

  it('points at the person\'s own instructions when the file has them', () => {
    const inputs = JSON.parse(text(path.join(captureDir, 'component-inputs.json'))) as Record<string, { capture: Capture }>;
    const capture = inputs['example-com.component.primary-button.design.md']!.capture;
    const withNote = spec(formatCapture({ ...capture, instructions: 'Use our brand blue #1d4ed8 instead.' } as Capture));
    expect(withNote.instructions).toBe('Use our brand blue #1d4ed8 instead.');
    expect(ruleText(withNote, '.luci/design/x.design.md')).toMatch(/\. Follow the person's instructions at the top of the file\.$/);
    expect(ruleText(spec(formatCapture(capture)), '.luci/design/x.design.md')).not.toContain('instructions');
  });
});
