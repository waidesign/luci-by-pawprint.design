import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnose, initProject, type Check } from '@luci/brain';
import { run } from '../src/index.js';
import { fakeContext, tempDir, tempProject } from './helpers.js';

const setUp = async () => {
  const dir = tempProject();
  await initProject(dir);
  return dir;
};
const find = (checks: readonly Check[], label: string) => checks.find(c => c.label === label);
const write = (dir: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text, 'utf8');
};

describe('luci doctor', () => {
  it('passes on a freshly set-up project and shows the context agents get', async () => {
    const dir = await setUp();
    const f = fakeContext(dir);
    expect(await run(['doctor'], f.ctx)).toBe(0);
    const text = f.text();
    expect(text).toContain('[ok]   Node.js');
    expect(text).toContain('[ok]   CLAUDE.md: Luci section up to date');
    expect(text).toContain('[ok]   .cursorrules: Luci section up to date');
    expect(text).toContain('[warn] Project goal: not written yet');
    expect(text).toContain('Context agents get');
    expect(text).toContain('No problems, 1 warning.');
  });

  it('outside a project it fails and says to run init', async () => {
    const f = fakeContext(tempProject());
    expect(await run(['doctor'], f.ctx)).toBe(1);
    expect(f.text()).toContain('[fail] Project memory');
    expect(f.text()).toContain('Fix: `luci init` here sets the project up.');
  });

  it('--json returns the checks and the summary', async () => {
    const dir = await setUp();
    const f = fakeContext(dir);
    expect(await run(['doctor', '--json'], f.ctx)).toBe(0);
    const json = JSON.parse(f.text()) as { ok: boolean; project: { name: string } };
    expect(json.ok).toBe(true);
    expect(json.project.name).toBe('demo');
  });
});

describe('every problem has a fix', () => {
  it('brain.json that does not parse', async () => {
    const dir = await setUp();
    write(dir, '.luci/brain.json', '{ broken');
    const check = find((await diagnose(dir)).checks, 'brain.json');
    expect(check).toMatchObject({ status: 'fail', fix: expect.stringContaining('luci init') });
  });

  it('missing local/.gitignore, so private notes could be committed', async () => {
    const dir = await setUp();
    fs.rmSync(path.join(dir, '.luci', 'local', '.gitignore'));
    const result = await diagnose(dir);
    expect(result.ok).toBe(false);
    expect(find(result.checks, 'Private notes')).toMatchObject({ status: 'fail', fix: expect.stringContaining('luci init') });
  });

  it('a missing memory file', async () => {
    const dir = await setUp();
    fs.rmSync(path.join(dir, '.luci', 'playbook.md'));
    expect(find((await diagnose(dir)).checks, 'Memory files')).toMatchObject({ status: 'warn', detail: expect.stringContaining('.luci/playbook.md') });
  });

  it('an agent file without the Luci section, and one out of date', async () => {
    const dir = await setUp();
    write(dir, 'CLAUDE.md', '# Only my notes\n');
    const cursor = path.join(dir, '.cursorrules');
    fs.writeFileSync(cursor, fs.readFileSync(cursor, 'utf8').replace('- Framework: node', '- Framework: old'), 'utf8');
    const checks = (await diagnose(dir)).checks;
    expect(find(checks, 'CLAUDE.md')).toMatchObject({ status: 'fail', detail: 'no Luci section' });
    expect(find(checks, '.cursorrules')).toMatchObject({ status: 'warn', detail: 'Luci section is out of date' });
  });

  it('a decision record or proposal that does not follow the template', async () => {
    const dir = await setUp();
    write(dir, '.luci/decisions/2026-11-12-bad.md', '# Bad\n\nno fields\n');
    write(dir, '.luci/memory/proposed/2026-11-12-half.md', '# Half\n\n- What happened: something\n');
    const checks = (await diagnose(dir)).checks;
    expect(checks.find(c => c.label === 'Decision record')).toMatchObject({ status: 'warn', detail: expect.stringContaining('2026-11-12-bad.md') });
    expect(checks.find(c => c.label === 'Proposed memory' && c.status === 'warn')?.detail).toContain('2026-11-12-half.md');
    expect(checks.find(c => c.label === 'Proposed memory' && c.status === 'info')?.detail).toContain('1 waiting for review');
  });

  it('a finished active task that agents would ignore', async () => {
    const dir = await setUp();
    write(dir, '.luci/local/active-task.md', '# Task\n\n- **Task**: Ship it\n- **Status**: done (2026-11-12)\n');
    expect(find((await diagnose(dir)).checks, 'Active task')).toMatchObject({ status: 'warn', detail: expect.stringContaining('"done"') });
  });

  it('a written goal and an active task show in the summary', async () => {
    const dir = await setUp();
    const context = path.join(dir, '.luci', 'context.md');
    fs.writeFileSync(context, fs.readFileSync(context, 'utf8').replace(/_Not written yet: one or two sentences[^\n]*/, 'A booking API.'), 'utf8');
    write(dir, '.luci/local/active-task.md', '- **Task**: Add refunds\n- **Status**: active\n- **Started**: 2026-11-12\n');
    const result = await diagnose(dir);
    expect(find(result.checks, 'Project goal')).toBeUndefined();
    expect(result.project).toMatchObject({ goal: 'A booking API.', activeTask: { task: 'Add refunds', status: 'active' } });
  });

  it('install: old Node, missing package files, no Global Brain yet', async () => {
    const dir = await setUp();
    const { checks } = await diagnose(dir, {
      nodeVersion: 'v16.20.0',
      templatesDir: tempDir(),
      defaultsDir: path.join(tempDir(), 'missing'),
      globalBrainDir: path.join(tempDir(), 'not-yet')
    });
    expect(find(checks, 'Node.js')).toMatchObject({ status: 'fail', fix: expect.stringContaining('18') });
    expect(find(checks, 'Luci files')).toMatchObject({ status: 'fail', fix: 'Reinstall Luci.' });
    expect(find(checks, 'Global Brain')).toMatchObject({ status: 'warn', fix: expect.stringContaining('luci init') });
  });

  it('a rule in .luci/rules.md that contradicts the Global Brain (B12, v0.3.5)', async () => {
    const dir = await setUp();
    const globalBrain = tempDir();
    fs.writeFileSync(path.join(globalBrain, 'coding-preferences.md'), '# Coding\n\n- Always use semicolons.\n', 'utf8');
    fs.appendFileSync(path.join(dir, '.luci', 'rules.md'), '- Never use semicolons.\n', 'utf8');

    const { checks } = await diagnose(dir, { globalBrainDir: globalBrain });
    const conflict = find(checks, 'Rule conflict');
    expect(conflict).toMatchObject({
      status: 'warn',
      detail: expect.stringContaining('Precedence: .luci/rules.md wins over Global Brain (~/.luci/brain).'),
      fix: expect.stringContaining('.luci/rules.md')
    });
    expect(conflict?.detail).toContain('.luci/rules.md:');
    expect(conflict?.detail).toContain('~/.luci/brain/coding-preferences.md:3');
  });

  it('every warn and fail names a fix', async () => {
    const dir = await setUp();
    fs.rmSync(path.join(dir, '.luci', 'local', '.gitignore'));
    write(dir, 'CLAUDE.md', 'x\n');
    for (const c of (await diagnose(dir, { nodeVersion: 'v16.0.0' })).checks) {
      if (c.status === 'warn' || c.status === 'fail') expect(c.fix, c.label).toBeTruthy();
    }
  });
});
