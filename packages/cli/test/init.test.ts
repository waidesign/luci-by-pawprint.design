import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/index.js';
import { fakeContext, readMemory, tempProject } from './helpers.js';

describe('luci init', () => {
  it('--yes sets the project up without questions', async () => {
    const dir = tempProject();
    const f = fakeContext(dir, { isTTY: true });
    expect(await run(['init', '--yes'], f.ctx)).toBe(0);
    expect(f.asked).toEqual([]);
    expect(fs.existsSync(path.join(dir, '.luci', 'brain.json'))).toBe(true);
    expect(f.text()).toContain('Created:');
    expect(f.text()).toContain('+ .luci/rules.md');
    expect(f.text()).toContain('+ CLAUDE.md');
    expect(f.text()).toContain('Your agents read .luci/ through CLAUDE.md and .cursorrules');
  });

  it('asks for the goal and rules in a terminal', async () => {
    const dir = tempProject();
    // Goal, then the skills question (nothing matches this goal, so it isn't asked), packs (none fit), rules
    const f = fakeContext(dir, { isTTY: true, answers: ['Flight control software for a drone', 'Use UTC everywhere', ''] });
    expect(await run(['init'], f.ctx)).toBe(0);
    expect(readMemory(dir, 'context.md')).toContain('## Project Goal\nFlight control software for a drone');
    expect(readMemory(dir, 'rules.md')).toContain('- Use UTC everywhere');
  });

  it('asks nothing when not in a terminal, unless -i', async () => {
    const dir = tempProject();
    const quiet = fakeContext(dir, { isTTY: false });
    await run(['init'], quiet.ctx);
    expect(quiet.asked).toEqual([]);

    const asked = fakeContext(dir, { isTTY: false, answers: ['Goal from a pipe'] });
    await run(['init', '-i'], asked.ctx);
    expect(readMemory(dir, 'context.md')).toContain('Goal from a pipe');
  });

  it('running again lists the kept files', async () => {
    const dir = tempProject();
    await run(['init', '--yes'], fakeContext(dir).ctx);
    const f = fakeContext(dir);
    await run(['init', '--yes'], f.ctx);
    expect(f.text()).toContain('Kept as they are:');
    expect(f.text()).toContain('= .luci/rules.md (exists)');
    expect(f.text()).toContain('= CLAUDE.md (up to date)');
  });

  it('--dry-run writes nothing and says what it would do', async () => {
    const dir = tempProject();
    const f = fakeContext(dir, { isTTY: true });
    expect(await run(['init', '--dry-run'], f.ctx)).toBe(0);
    expect(f.text()).toContain('dry run: nothing is written');
    expect(f.text()).toContain('Would create:');
    expect(f.asked).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual(['package.json']);
  });

  it('rejects unknown options', async () => {
    const f = fakeContext(tempProject());
    expect(await run(['init', '--frobnicate'], f.ctx)).toBe(1);
    expect(f.errors()).toContain('Unknown option for init: --frobnicate');
  });
});
