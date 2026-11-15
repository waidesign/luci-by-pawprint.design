import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject, startProject, updateProject, writeActiveTask } from '@luci-dev/brain';
import { run } from '../src/index.js';
import { fakeContext, readMemory, tempDir, tempProject } from './helpers.js';

const project = async () => {
  const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '^18' }, devDependencies: { vite: '^5' } }) });
  await initProject(dir);
  return dir;
};
const luci = async (dir: string, ...args: string[]) => {
  const f = fakeContext(dir);
  const code = await run(args, f.ctx);
  return { code, out: f.text(), err: f.errors() };
};

// Ported from the prototype: brain-layout.test.js ("update")
describe('update (B4)', () => {
  it('refreshes (auto-detected) sections, keeps (confirmed) ones and the team\'s text', async () => {
    const dir = await project();
    const contextFile = path.join(dir, '.luci', 'context.md');
    fs.writeFileSync(contextFile, fs.readFileSync(contextFile, 'utf8')
      .replace('## Folder Map (auto-detected)', '## Folder Map (confirmed)')
      .replace(/_Not written yet: naming[^\n]*/, 'Use kebab-case file names.'), 'utf8');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'vitest run' }, dependencies: { react: '^18' } }), 'utf8');
    fs.mkdirSync(path.join(dir, 'docs'));

    const report = await updateProject(dir);
    const text = readMemory(dir, 'context.md');
    expect(text).toContain('- Test: `npm test`');
    expect(text).not.toContain('`docs/`');
    expect(text).toContain('Use kebab-case file names.');
    expect(report.refreshedSections).toContain('context.md Commands');
  });

  it('adds missing files and keeps edited ones; agent files are refreshed', async () => {
    const dir = await project();
    fs.rmSync(path.join(dir, '.luci', 'playbook.md'));
    fs.appendFileSync(path.join(dir, '.luci', 'rules.md'), '- Prices in euros\n');
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n', 'utf8');
    const report = await updateProject(dir);
    expect(report.added).toContain('.luci/playbook.md');
    expect(readMemory(dir, 'rules.md')).toContain('- Prices in euros');
    expect(report.agentFiles).toContain('CLAUDE.md');
    expect(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toContain('# Mine');
  });

  it('a project without .luci/ is reported, not created', async () => {
    const dir = tempProject();
    expect((await updateProject(dir)).initialized).toBe(false);
    expect(fs.existsSync(path.join(dir, '.luci'))).toBe(false);
  });
});

// Ported from the prototype: global-brain-link.test.js ("start")
describe('start (B3)', () => {
  it('the Global Brain summary follows changes, and the context is reported', async () => {
    const globalBrain = tempDir('luci-gb-');
    fs.writeFileSync(path.join(globalBrain, 'design-principles.md'), '# Design\n\n- Prefer clean typography', 'utf8');
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }) });
    await initProject(dir, { globalBrainDir: globalBrain });
    fs.writeFileSync(path.join(globalBrain, 'design-principles.md'), '# Design\n\n- Prefer generous whitespace', 'utf8');
    writeActiveTask(dir, '# Active Task\n\n- **Task**: Add refunds\n- **Status**: active\n- **Started**: 2026-11-12\n');

    const report = await startProject(dir, { globalBrainDir: globalBrain });
    const summary = readMemory(dir, 'local/global-brain.md');
    expect(summary).toContain('Prefer generous whitespace');
    expect(summary).not.toContain('Prefer clean typography');
    expect(report.diagnosis?.project?.activeTask?.task).toBe('Add refunds');
  });

  it('luci start shows the active task and what to do next', async () => {
    const dir = await project();
    writeActiveTask(dir, '# Active Task\n\n- **Task**: Add refunds\n- **Status**: active\n- **Started**: 2026-11-12\n');
    const r = await luci(dir, 'start');
    expect(r.out).toContain('Active task:  Add refunds (since 2026-11-12)');
    expect(r.out).toContain('continue the active task');
    expect(r.out).toContain('[warn] Project goal');
    expect((await luci(tempProject(), 'start')).code).toBe(1);
  });

  it('luci update reports what it refreshed and keeps the rest', async () => {
    const r = await luci(await project(), 'update');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Everything you wrote was kept');
  });
});
