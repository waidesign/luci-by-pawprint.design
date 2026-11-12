import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRECEDENCE, parseDecision } from '@luci/format';
import {
  DEFAULT_BRAIN_DIR,
  GLOBAL_PREFERENCE_FILES,
  MemoryEngine,
  initProject,
  luciHome,
  userBrainDir,
  writeGlobalBrainSnapshot
} from '@luci/brain';
import { listFiles, memoryExists, pkg, readMemory, tempDir, tempProject } from './helpers.js';

describe('Global Brain', () => {
  // Ported from the prototype: memory-engine.test.js
  it('initialises with the default preferences', async () => {
    const engine = new MemoryEngine({ globalBrainDir: tempDir('luci-brain-') });
    const brain = engine.getGlobalBrain();
    expect(brain['identity.md']).toBeTruthy();
    expect(brain['design-principles.md']).toBeTruthy();
    expect(brain['coding-preferences.md']).toBeTruthy();
  });

  it('precedence: safety rules first, then the request, project rules, Global Brain', async () => {
    expect(PRECEDENCE[0]).toMatch(/^Safety rules/);
    expect(PRECEDENCE[1]).toBe("The user's request");
    expect(PRECEDENCE[2]).toBe('.luci/rules.md (other rules)');
    expect(PRECEDENCE[3]).toBe('Global Brain (~/.luci/brain)');
  });

  it('lives in the user folder (LUCI_HOME), never in the package', async () => {
    const engine = new MemoryEngine();
    expect(engine.globalBrainDir).toBe(userBrainDir());
    expect(userBrainDir()).toBe(path.join(luciHome(), 'brain'));
    expect(luciHome()).toBe(path.resolve(process.env['LUCI_HOME'] ?? ''));
    expect(path.resolve(engine.globalBrainDir)).not.toBe(path.resolve(DEFAULT_BRAIN_DIR));
  });

  it('defaults to ~/.luci without LUCI_HOME', async () => {
    const saved = process.env['LUCI_HOME'];
    delete process.env['LUCI_HOME'];
    try {
      expect(luciHome()).toBe(path.join(os.homedir(), '.luci'));
    } finally {
      process.env['LUCI_HOME'] = saved;
    }
  });

  it('is seeded from the defaults without overwriting the user', async () => {
    const defaults = tempDir('luci-defaults-');
    const user = tempDir('luci-user-brain-');
    fs.writeFileSync(path.join(defaults, 'design-principles.md'), '# Default principles', 'utf8');
    fs.writeFileSync(path.join(defaults, 'identity.md'), '# Default identity', 'utf8');
    fs.writeFileSync(path.join(defaults, 'README.md'), '# About the defaults folder', 'utf8');
    fs.writeFileSync(path.join(user, 'identity.md'), '# My own identity', 'utf8');

    const engine = new MemoryEngine({ globalBrainDir: user, defaultsDir: defaults });
    engine.initGlobalBrain();

    expect(fs.readFileSync(path.join(user, 'design-principles.md'), 'utf8')).toBe('# Default principles');
    expect(fs.readFileSync(path.join(user, 'identity.md'), 'utf8')).toBe('# My own identity');
    expect(fs.readFileSync(path.join(user, 'README.md'), 'utf8')).toMatch(/^# Global Brain/);

    // Decisions are written to the user's brain, never to the defaults
    engine.recordGlobalDecision({ category: 'Testing', decision: 'Use UTC everywhere', context: 'unit test' });
    expect(fs.readFileSync(path.join(user, 'decision-history.md'), 'utf8')).toContain('Use UTC everywhere');
    expect(fs.existsSync(path.join(defaults, 'decision-history.md'))).toBe(false);
  });

  it('the shipped defaults hold no personal decisions and no prototype names', async () => {
    const history = fs.readFileSync(path.join(DEFAULT_BRAIN_DIR, 'decision-history.md'), 'utf8');
    expect(history.split('\n').filter(l => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l))).toEqual([]);
    for (const file of listFiles(DEFAULT_BRAIN_DIR)) {
      expect(fs.readFileSync(path.join(DEFAULT_BRAIN_DIR, file), 'utf8'), file).not.toMatch(/gaw|guided agent|agentation|ai-brain/i);
    }
  });

  it('a global decision is one table row, whatever it contains', async () => {
    const engine = new MemoryEngine({ globalBrainDir: tempDir('luci-brain-') });
    const file = engine.recordGlobalDecision({ category: 'UI', decision: 'Grid | 8px', context: 'line one\nline two' });
    const row = fs.readFileSync(file, 'utf8').trim().split('\n').at(-1);
    expect(row).toMatch(/^\| \d{4}-\d{2}-\d{2} \| UI \| Grid - 8px \| line one line two \|$/);
  });
});

describe('project decisions', () => {
  it('are written as valid decision records, never overwriting one', async () => {
    const dir = tempProject({ 'package.json': pkg() });
    await initProject(dir);
    const engine = new MemoryEngine();
    const input = { category: 'Architecture', decision: 'Use pnpm workspaces', context: 'One install links every package.' };

    const first = engine.recordProjectDecision(dir, input);
    const second = engine.recordProjectDecision(dir, input);
    expect(first).toMatch(/^\.luci\/decisions\/\d{4}-\d{2}-\d{2}-use-pnpm-workspaces\.md$/);
    expect(second).toMatch(/-use-pnpm-workspaces-2\.md$/);

    const record = parseDecision(fs.readFileSync(path.join(dir, first), 'utf8'));
    if (!record.ok) throw new Error(record.error);
    expect(record.value).toMatchObject({ title: 'Use pnpm workspaces', status: 'accepted', area: 'Architecture', why: 'One install links every package.' });
  });

  it('fail loudly when the project has no memory folder', async () => {
    const dir = tempProject({ 'package.json': pkg() });
    expect(() => new MemoryEngine().recordProjectDecision(dir, { category: 'X', decision: 'Y', context: 'Z' })).toThrow(/luci init/);
  });
});

// Ported from the prototype: global-brain-link.test.js
describe('link between global and project memory', () => {
  function setup() {
    const globalBrain = tempDir('luci-gb-');
    fs.writeFileSync(path.join(globalBrain, 'design-principles.md'), '# Design\n\n- Prefer clean typography', 'utf8');
    fs.writeFileSync(path.join(globalBrain, 'decision-history.md'),
      '# History\n\n| Timestamp | Category | Decision | Context |\n|---|---|---|---|\n| 2026-01-01 | UI | Use 8px grid | test |\n', 'utf8');
    const project = tempProject({ 'package.json': pkg(), '.gitignore': 'node_modules/\n' });
    return { globalBrain, project };
  }

  it('init: the project gets project files only, plus a read-only Global Brain summary', async () => {
    const { globalBrain, project } = setup();
    await initProject(project, { globalBrainDir: globalBrain });

    for (const file of GLOBAL_PREFERENCE_FILES) expect(memoryExists(project, file), `${file} is not copied`).toBe(false);
    for (const file of ['context.md', 'rules.md', 'playbook.md']) expect(memoryExists(project, file)).toBe(true);

    const summary = readMemory(project, 'local/global-brain.md');
    expect(summary).toContain('Do not edit');
    expect(summary).toContain('Prefer clean typography');
    expect(summary).toContain('Use 8px grid');
    expect(readMemory(project, 'local/.gitignore')).toContain('*');
    expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toBe('node_modules/\n');
  });

  it('the summary follows changes to the Global Brain', async () => {
    const { globalBrain, project } = setup();
    await initProject(project, { globalBrainDir: globalBrain });
    fs.writeFileSync(path.join(globalBrain, 'design-principles.md'), '# Design\n\n- Prefer generous whitespace', 'utf8');

    writeGlobalBrainSnapshot(project, globalBrain);
    const summary = readMemory(project, 'local/global-brain.md');
    expect(summary).toContain('Prefer generous whitespace');
    expect(summary).not.toContain('Prefer clean typography');
  });

  it('a summary is only written into a project that has .luci/', async () => {
    const { globalBrain } = setup();
    expect(writeGlobalBrainSnapshot(tempProject(), globalBrain)).toBeNull();
  });

  it('a dry run does not create the Global Brain either', async () => {
    const globalBrain = path.join(tempDir('luci-gb-parent-'), 'brain');
    const project = tempProject({ 'package.json': pkg() });
    const report = await initProject(project, { dryRun: true, globalBrainDir: globalBrain });
    expect(fs.existsSync(globalBrain)).toBe(false);
    expect(report.created).toContain('.luci/local/global-brain.md');
  });
});
