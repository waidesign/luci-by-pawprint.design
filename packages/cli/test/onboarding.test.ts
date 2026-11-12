import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { initProject } from '@luci/brain';
import { createLineAsker, runOnboarding } from '../src/index.js';
import { readMemory, tempProject } from './helpers.js';

function scripted(...answers: string[]) {
  const asked: string[] = [];
  return { asked, ask: async (q: string) => { asked.push(q); return answers.shift() ?? ''; } };
}
const silent = () => {};
const initialised = () => {
  const dir = tempProject();
  initProject(dir);
  return dir;
};

// Ported from the prototype: onboarding.test.js (the skill and pack steps arrive in M2)
describe('onboarding', () => {
  it('saves the goal in place of the placeholder and the rules under Project-Specific Rules', async () => {
    const dir = initialised();
    const res = await runOnboarding({ projectDir: dir, ask: scripted('A SaaS landing page with pricing for my startup', 'Support Safari 15+', '').ask, log: silent });

    expect(readMemory(dir, 'context.md')).toContain('## Project Goal\nA SaaS landing page with pricing for my startup');
    expect(readMemory(dir, 'context.md')).not.toContain('Not written yet: one or two sentences');
    const rules = readMemory(dir, 'rules.md');
    expect(rules).toMatch(/## Project-Specific Rules\n(<!--.*-->\n)?- Support Safari 15\+/);
    expect(rules).toContain('## Safety');
    expect(res.written).toHaveLength(2);
  });

  it('skipping everything writes nothing', async () => {
    const dir = initialised();
    const contextBefore = readMemory(dir, 'context.md');
    const rulesBefore = readMemory(dir, 'rules.md');
    const res = await runOnboarding({ projectDir: dir, ask: scripted().ask, log: silent });
    expect(res.written).toEqual([]);
    expect(readMemory(dir, 'context.md')).toBe(contextBefore);
    expect(readMemory(dir, 'rules.md')).toBe(rulesBefore);
  });

  it('running twice does not duplicate rules', async () => {
    const dir = initialised();
    await runOnboarding({ projectDir: dir, ask: scripted('', 'Use UTC everywhere', '').ask, log: silent });
    await runOnboarding({ projectDir: dir, ask: scripted('', 'Use UTC everywhere', '').ask, log: silent });
    expect(readMemory(dir, 'rules.md').split('- Use UTC everywhere')).toHaveLength(2);
  });

  it('several rules are saved in order', async () => {
    const dir = initialised();
    await runOnboarding({ projectDir: dir, ask: scripted('', 'Follow MISRA C', 'No dynamic allocation', '').ask, log: silent });
    expect(readMemory(dir, 'rules.md')).toMatch(/- Follow MISRA C\n- No dynamic allocation\n$/);
  });
});

describe('line asker', () => {
  it('keeps answers typed ahead and treats end of input as skip', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const { ask, close } = createLineAsker(input, output);
    input.write('﻿first\nsecond\n');
    input.end();
    expect(await ask('1? ')).toBe('first');
    expect(await ask('2? ')).toBe('second');
    expect(await ask('3? ')).toBe('');
    close();
  });
});
