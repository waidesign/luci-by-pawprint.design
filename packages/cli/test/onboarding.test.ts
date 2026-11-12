import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { initProject } from '@luci/brain';
import { SkillRegistry, addedPacks, readLock } from '@luci/skills';
import { createLineAsker, parseSelection, runOnboarding } from '../src/index.js';
import { readMemory, tempProject } from './helpers.js';

const registry = new SkillRegistry({ autoIndex: false });
function scripted(...answers: string[]) {
  const asked: string[] = [];
  return { asked, ask: async (q: string) => { asked.push(q); return answers.shift() ?? ''; } };
}
const silent = () => {};
const initialised = async (files?: Record<string, string>) => {
  const dir = tempProject(files);
  await initProject(dir, { registry });
  return dir;
};
const reactApp = { 'package.json': JSON.stringify({ name: 'app', dependencies: { react: '^18', 'react-dom': '^18', gsap: '^3' }, devDependencies: { vite: '^5' } }) };

// Ported from the prototype: onboarding.test.js
describe('onboarding', () => {
  it('parseSelection: Enter keeps all, n keeps none, numbers keep those, junk is invalid', () => {
    expect(parseSelection('', 3)).toEqual([0, 1, 2]);
    expect(parseSelection('n', 3)).toEqual([]);
    expect(parseSelection('1,3', 3)).toEqual([0, 2]);
    expect(parseSelection('3 1 3', 3)).toEqual([2, 0]);
    expect(parseSelection('4', 3)).toBeNull();
    expect(parseSelection('landing-page', 3)).toBeNull();
  });

  it('UI goal: saves the goal, selects matching skills, saves rules', async () => {
    const dir = await initialised();
    const res = await runOnboarding({ projectDir: dir, registry, ask: scripted('A SaaS landing page with pricing for my startup', '', 'Support Safari 15+', '').ask, log: silent });

    expect(readMemory(dir, 'context.md')).toContain('## Project Goal\nA SaaS landing page with pricing for my startup');
    expect(readMemory(dir, 'context.md')).not.toContain('Not written yet: one or two sentences');
    const lock = readLock(dir);
    expect(lock.skills.some(s => s.id === 'landing-page')).toBe(true);
    expect(lock.skills.every(s => s.reason?.startsWith('Matches the project goal'))).toBe(true);
    const catalog = readMemory(dir, 'project-skills.md');
    expect(catalog).toContain('(`landing-page`)');
    expect(catalog).toContain('Open a skill only when the current task needs it');
    const rules = readMemory(dir, 'rules.md');
    expect(rules).toMatch(/## Project-Specific Rules\n(<!--.*-->\n)?- Support Safari 15\+/);
    expect(rules).toContain('## Safety');
    expect(res.written).toHaveLength(3);
    expect(fs.existsSync(path.join(dir, '.luci', 'local', 'active-task.md'))).toBe(false);
  });

  it('a field the library does not cover: no unrelated skills are suggested', async () => {
    const dir = await initialised();
    const logs: string[] = [];
    const { ask, asked } = scripted('Flight control software for a drone in embedded C', 'Follow MISRA C', '');
    await runOnboarding({ projectDir: dir, registry, ask, log: (m) => logs.push(m) });
    expect(readLock(dir).skills).toEqual([]);
    expect(logs.join('\n')).toContain('No skills in the library closely match');
    expect(asked.some(q => q.includes('Use these?'))).toBe(false);
    expect(readMemory(dir, 'rules.md')).toContain('- Follow MISRA C');
  });

  it('picking by number keeps only the chosen skills', async () => {
    const dir = await initialised();
    await runOnboarding({ projectDir: dir, registry, ask: scripted('A SaaS landing page with pricing for my startup', '2', '').ask, log: silent });
    expect(readLock(dir).skills).toHaveLength(1);
  });

  it('skipping everything writes nothing', async () => {
    const dir = await initialised();
    const contextBefore = readMemory(dir, 'context.md');
    const rulesBefore = readMemory(dir, 'rules.md');
    const res = await runOnboarding({ projectDir: dir, registry, ask: scripted().ask, log: silent });
    expect(res.written).toEqual([]);
    expect(readMemory(dir, 'context.md')).toBe(contextBefore);
    expect(readMemory(dir, 'rules.md')).toBe(rulesBefore);
    expect(fs.existsSync(path.join(dir, '.luci', 'skills.lock.json'))).toBe(false);
  });

  it('running twice does not duplicate rules', async () => {
    const dir = await initialised();
    await runOnboarding({ projectDir: dir, registry, ask: scripted('', 'Use UTC everywhere', '').ask, log: silent });
    await runOnboarding({ projectDir: dir, registry, ask: scripted('', 'Use UTC everywhere', '').ask, log: silent });
    expect(readMemory(dir, 'rules.md').split('- Use UTC everywhere')).toHaveLength(2);
  });

  // Ported from the prototype: packs.test.js (onboarding)
  it('offers fitting packs (goal included) and adds the chosen ones', async () => {
    const dir = await initialised(reactApp);
    const logs: string[] = [];
    const { ask, asked } = scripted('Marketing site with a pricing page', 'n', '', '');
    await runOnboarding({ projectDir: dir, registry, ask, log: (m) => logs.push(m) });
    expect(asked.some(q => q.includes('Add these packs?'))).toBe(true);
    expect(logs.join('\n')).toContain('marketing: Marketing pages');
    expect(addedPacks(dir)).toEqual(['marketing', 'motion', 'ui']);
    expect(readMemory(dir, 'project-skills.md')).toContain('masked-reveal');
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
