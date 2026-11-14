import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProposal } from '@luci/format';
import { DesignStore, initProject } from '@luci/brain';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

const golden = (name: string) => fs.readFileSync(fileURLToPath(new URL(`../../format/fixtures/capture/${name}`, import.meta.url)), 'utf8');
const BUTTON = 'example-com.component.primary-button.design.md';

async function project() {
  const dir = tempProject();
  await initProject(dir);
  const store = new DesignStore(dir);
  store.save(BUTTON, golden(BUTTON));
  store.save('example-com.system.typography.design.md', golden('example-com.system.typography.design.md'));
  return dir;
}
const proposals = (dir: string) => fs.readdirSync(path.join(dir, '.luci', 'memory', 'proposed')).filter(f => f !== 'README.md');

describe('luci capture: capture to rule (v0.3.2)', () => {
  it('lists the saved captures', async () => {
    const dir = await project();
    const f = fakeContext(dir);
    expect(await run(['capture'], f.ctx)).toBe(0);
    expect(f.text()).toContain(`  ${BUTTON}  (component, button, from https://example.com/pricing, 2026-11-12)`);
    expect(f.text()).toContain('luci capture rule <file>');
  });

  it('proposes a rule from a component capture, once; rules.md is never edited', async () => {
    const dir = await project();
    const rules = fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8');

    const dry = fakeContext(dir);
    expect(await run(['capture', 'rule', BUTTON, '--dry-run'], dry.ctx)).toBe(0);
    expect(dry.text()).toContain('- Proposed: Build every primary button like `.luci/design/example-com.component.primary-button.design.md`');
    expect(proposals(dir)).toEqual([]);

    const f = fakeContext(dir);
    // A path to the file works too
    expect(await run(['capture', 'rule', `.luci/design/${BUTTON}`], f.ctx)).toBe(0);
    const [file] = proposals(dir);
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}-build-every-primary-button-like-its-design-file\.md$/);
    expect(f.text()).toContain(`Proposed a rule: .luci/memory/proposed/${file}`);
    expect(f.text()).toContain('move that line into .luci/rules.md');
    const parsed = parseProposal(fs.readFileSync(path.join(dir, '.luci', 'memory', 'proposed', file!), 'utf8'));
    expect(parsed.ok && parsed.value.belongsIn).toBe('rules.md');

    // The same rule again: the waiting one, nothing new
    const again = fakeContext(dir);
    expect(await run(['capture', 'rule', BUTTON], again.ctx)).toBe(0);
    expect(again.text()).toContain(`already waiting for your review: .luci/memory/proposed/${file}`);
    expect(proposals(dir)).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8')).toBe(rules);
  });

  it('says what is wrong: not a component, not saved, no file named', async () => {
    const dir = await project();
    const system = fakeContext(dir);
    expect(await run(['capture', 'rule', 'example-com.system.typography.design.md'], system.ctx)).toBe(1);
    expect(system.errors()).toContain('A rule needs a component file');
    const missing = fakeContext(dir);
    expect(await run(['capture', 'rule', 'example-com.component.nope.design.md'], missing.ctx)).toBe(1);
    expect(missing.errors()).toContain('Save the capture into the project first');
    const none = fakeContext(dir);
    expect(await run(['capture', 'rule'], none.ctx)).toBe(1);
    expect(none.errors()).toContain('Name one saved capture file.');
    expect(proposals(dir)).toEqual([]);
  });
});
