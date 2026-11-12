import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveActiveTask, diagnose, initProject, readActiveTask, writeActiveTask } from '@luci/brain';
import { SkillOrchestrator, SkillRegistry } from '@luci/skills';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

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
const header = (task: string, status = 'active') => `# Active Task\n\n- **Task**: ${task}\n- **Status**: ${status}\n- **Started**: 2026-11-12\n`;

// Ported from the prototype: brain-layout.test.js (active task)
describe('active task (B9)', () => {
  it('a task is archived when replaced or done, and only an active one counts', async () => {
    const dir = await project();
    writeActiveTask(dir, header('First task'));
    expect(readActiveTask(dir)).toMatchObject({ task: 'First task', status: 'active', file: '.luci/local/active-task.md' });

    const { archived } = writeActiveTask(dir, header('Second task'));
    expect(archived).toBe('.luci/local/archive/2026-11-12-first-task.md');
    expect(fs.readFileSync(path.join(dir, archived ?? ''), 'utf8')).toMatch(/- \*\*Status\*\*: replaced \(\d{4}-\d{2}-\d{2}\)/);
    expect(readActiveTask(dir)?.task).toBe('Second task');

    expect(archiveActiveTask(dir)).toBe('.luci/local/archive/2026-11-12-second-task.md');
    expect(readActiveTask(dir)).toBeNull();
    expect(archiveActiveTask(dir)).toBeNull();
  });

  it('a finished task left in place is ignored and doctor says so', async () => {
    const dir = await project();
    writeActiveTask(dir, header('Old work', 'done'));
    expect(readActiveTask(dir)?.status).toBe('done');
    const result = await diagnose(dir);
    expect(result.project?.activeTask).toBeNull();
    expect(result.checks.find(c => c.label === 'Active task')?.status).toBe('warn');
  });

  it('the pointer lists files, reasons and checks, never skill bodies', async () => {
    const loaded = await new SkillOrchestrator(new SkillRegistry({ autoIndex: false })).loadSkillsForTask('Design a SaaS pricing page with a monthly and yearly billing toggle');
    const pointer = new SkillOrchestrator(new SkillRegistry({ autoIndex: false })).formatTaskPointer(loaded, {
      projectInfo: { framework: 'react-vite', languages: ['JavaScript'], hasUi: true, uiLibraries: [] }
    });
    expect(pointer).toContain('- **Status**: active');
    expect(pointer).toContain('pricing-page');
    expect(pointer).toContain('accessibility-baseline');
    expect(pointer).toContain('JavaScript · plain CSS');
    expect(pointer).toContain('`luci task done`');
    expect(pointer).toContain('.luci/context.md');
    expect(pointer).not.toContain('```');
    expect(pointer.length).toBeLessThan(4000);
  });
});

describe('luci skills use --inject and luci task', () => {
  it('writes the active task, shows it, and archives it when done', async () => {
    const dir = await project();
    const injected = await luci(dir, 'skills', 'use', 'Design a SaaS pricing page', '--inject');
    expect(injected.code).toBe(0);
    expect(injected.out).toContain('Wrote the active task');
    expect(fs.readFileSync(path.join(dir, '.luci', 'local', 'active-task.md'), 'utf8')).toContain('pricing-page');

    const shown = await luci(dir, 'task');
    expect(shown.out).toContain('Task:    Design a SaaS pricing page');
    expect(shown.out).toContain('Status:  active');
    expect((await luci(dir, 'task', 'done')).out).toContain('Task archived to .luci/local/archive/');
    expect((await luci(dir, 'task')).out).toContain('No active task');
  });

  it('a task nothing matches leaves the active task alone', async () => {
    const dir = await project();
    writeActiveTask(dir, header('Keep me'));
    expect((await luci(dir, 'skills', 'use', 'Simulate orbital mechanics', '--inject')).out).toContain('left unchanged');
    expect(readActiveTask(dir)?.task).toBe('Keep me');
  });
});
