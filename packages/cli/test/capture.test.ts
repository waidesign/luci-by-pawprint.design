import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProposal } from '@luci/format';
import { CheckStore, DesignStore, FeedbackStore, initProject } from '@luci/brain';
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

describe('luci capture baseline (B14) and compare (v0.4)', () => {
  it('builds the design baseline from the project stylesheets; init already did, and a rebuild reports it', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/app.css': ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\n.card { padding: var(--space-4); background: var(--brand); }\n' });
    const init = fakeContext(dir);
    expect(await run(['init', '--yes'], init.ctx)).toBe(0);
    expect(init.text()).toContain('Design baseline: 3 files from 1 stylesheet and 2 tokens');
    expect(new DesignStore(dir).list().map(f => f.file)).toContain('project.system.color.design.md');
    const f = fakeContext(dir);
    expect(await run(['capture', 'baseline'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Read 1 stylesheet and 2 custom properties.');
    expect(f.text()).toContain('Wrote .luci/design/project.system.spacing.design.md');
  });

  it('--stitch also writes the baseline as DESIGN.md at the project root, never over one without --force', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/app.css': ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\n.card { padding: var(--space-4); background: var(--brand); }\n' });
    await initProject(dir);
    const f = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--stitch'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Wrote DESIGN.md (DESIGN.md format, for Google Stitch and other DESIGN.md tools)');
    const md = fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8');
    expect(md).toMatch(/^---\nversion: alpha\nname: /);
    expect(md).toContain('primary: "#0f62fe"');
    expect(md).toContain('## Colors');
    const again = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--stitch'], again.ctx)).toBe(1);
    expect(again.errors()).toContain('DESIGN.md is already in this project. Run again with --force to replace it.');
    expect(await run(['capture', 'baseline', '--stitch', '--force'], fakeContext(dir).ctx)).toBe(0);
  });

  it('says so when a project has no stylesheets, and needs init first', async () => {
    const bare = tempProject();
    const none = fakeContext(bare);
    expect(await run(['capture', 'baseline'], none.ctx)).toBe(1);
    expect(none.errors()).toContain('run `luci init` first');
    await initProject(bare);
    const empty = fakeContext(bare);
    expect(await run(['capture', 'baseline'], empty.ctx)).toBe(0);
    expect(empty.text()).toContain('No stylesheets found in this project');
  });

  it('compares two component captures', async () => {
    const dir = await project();
    const other = golden(BUTTON).replace('name: primary-button', 'name: buy-button').replace(/border-radius 8px \(--radius-md\)/, 'border-radius 12px');
    new DesignStore(dir).save('other-example.component.buy-button.design.md', other);
    const f = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, 'other-example.component.buy-button.design.md'], f.ctx)).toBe(0);
    expect(f.text()).toContain(`# Compare: ${BUTTON} and other-example.component.buy-button.design.md`);
    const same = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, BUTTON], same.ctx)).toBe(0);
    expect(same.text()).toContain('No differences: every value compared is the same.');
    const bad = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, 'example-com.system.typography.design.md'], bad.ctx)).toBe(1);
    expect(bad.errors()).toContain('The second file is not a component capture');
  });

  it('lists recent design checks with open notes (v0.4.1)', async () => {
    const dir = await project();
    const empty = fakeContext(dir);
    expect(await run(['capture', 'checks'], empty.ctx)).toBe(0);
    expect(empty.text()).toContain('No design checks saved');

    const checks = new CheckStore(dir);
    checks.save({
      design: `.luci/design/${BUTTON}`, label: 'primary-button (button)', selector: '#btn', page: 'http://localhost:3000/', checkedAt: '2026-11-15T12:00:00.000Z', matches: 10,
      differences: [{ kind: 'style', part: 'container', property: 'padding', expected: '12px', actual: '6px', comment: 'Padding is still off.', priority: 'medium' }]
    });

    const fb = new FeedbackStore(dir);
    fb.add({
      page: { url: 'http://localhost:3000/' },
      target: { kind: 'element', selector: '#btn', element: 'button' },
      comment: 'Padding is still off.',
      intent: 'fix',
      priority: 'medium',
      check: { design: `.luci/design/${BUTTON}`, part: 'container', property: 'padding', expected: '12px', actual: '6px' }
    });

    const f = fakeContext(dir);
    expect(await run(['capture', 'checks'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Latest design checks (1):');
    expect(f.text()).toContain('## primary-button (button): 1 difference');
    expect(f.text()).toContain('[Note: P1-A1]');
  });
});
