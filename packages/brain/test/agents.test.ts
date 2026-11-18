import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configureAgent, configureAgents, initProject } from '@luci-dev/brain';
import { pkg, tempProject } from './helpers.js';

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const react = { framework: 'react' };

describe('agent files', () => {
  it('init writes Claude Code and Cursor by default, and no file for agents the project does not use', async () => {
    const dir = tempProject({ 'package.json': pkg() });
    await initProject(dir);
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.cursorrules'))).toBe(true);
    for (const other of ['AGENTS.md', 'GEMINI.md', 'AGENT_INSTRUCTIONS.md', '.github/copilot-instructions.md']) {
      expect(fs.existsSync(path.join(dir, other)), other).toBe(false);
    }
  });

  it('Codex, Gemini CLI, Copilot and the generic file (v0.2): when asked for, or when the project has their file', async () => {
    const dir = tempProject({ 'package.json': pkg(), 'GEMINI.md': '# Our Gemini notes\n' });
    const report = await initProject(dir, { agents: ['codex', 'copilot'] });
    expect(Object.keys(report.agents).sort()).toEqual(['claudeCode', 'codex', 'copilot', 'cursor', 'gemini']);
    expect(read(dir, 'AGENTS.md')).toMatch(/^<!-- LUCI — CODEX CONFIGURATION -->\n# Codex Project Guidelines\n/);
    expect(read(dir, '.github/copilot-instructions.md')).toMatch(/^<!-- LUCI — GITHUB COPILOT CONFIGURATION -->\n# GitHub Copilot Custom Instructions\n/);
    // The project's own Gemini file keeps its text under the section
    expect(read(dir, 'GEMINI.md')).toMatch(/^<!-- LUCI — GEMINI CLI CONFIGURATION -->[\s\S]*<!-- END LUCI -->\n\n# Our Gemini notes\n$/);
    expect(fs.existsSync(path.join(dir, 'AGENT_INSTRUCTIONS.md'))).toBe(false);
    for (const file of ['AGENTS.md', 'GEMINI.md', '.github/copilot-instructions.md']) expect(read(dir, file), file).toContain('./.luci/rules.md');
    // Later runs keep them current without being asked again
    expect(Object.keys(configureAgents(dir, react)).sort()).toEqual(['claudeCode', 'codex', 'copilot', 'cursor', 'gemini']);
    expect(configureAgent('generic', dir, react).action).toBe('created');
    expect(read(dir, 'AGENT_INSTRUCTIONS.md')).toContain('<!-- LUCI — GENERIC AGENTS CONFIGURATION -->');
  });

  it('every path the block points to exists after init', async () => {
    const dir = tempProject({ 'package.json': pkg() });
    await initProject(dir);
    const text = read(dir, 'CLAUDE.md');
    const paths = [...text.matchAll(/\.\/\.luci\/([\w./-]+?)(?=[\s,;)]|\.?\s|$)/g)].map(m => m[1] ?? '');
    expect(paths).toEqual(expect.arrayContaining(['rules.md', 'context.md', 'playbook.md', 'local/global-brain.md', 'decisions/', 'memory/proposed/']));
    for (const rel of new Set(paths)) {
      if (rel === 'local/active-task.md') continue; // written by the task commands, only while there is a task
      expect(fs.existsSync(path.join(dir, '.luci', rel)), rel).toBe(true);
    }
  });

  it('uses Luci names and markers only', async () => {
    const dir = tempProject();
    configureAgents(dir, react);
    for (const file of ['CLAUDE.md', '.cursorrules']) {
      const text = read(dir, file);
      expect(text, file).toMatch(/^<!-- LUCI — (CLAUDE CODE|CURSOR) CONFIGURATION -->\n/);
      expect(text, file).toContain('<!-- END LUCI -->');
      expect(text, file).not.toMatch(/gaw|guided agent|ai-brain/i);
      expect(text, file).toContain('Before UI or design work: run `luci doctor`');
      expect(text, file).toContain('if PowerShell blocks `luci`, use `luci.cmd`');
    }
  });

  // Ported from the prototype: project-context.test.js (with Luci's own markers)
  it('the Luci section is refreshed in place, other content kept', async () => {
    const dir = tempProject();
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'),
      '# My heading\n\n<!-- LUCI — CLAUDE CODE CONFIGURATION -->\n# Old\n- Old line\n<!-- END LUCI -->\n\n# My own notes\nKeep me.\n', 'utf8');

    expect(configureAgent('claudeCode', dir, react).action).toBe('updated');
    const text = read(dir, 'CLAUDE.md');
    expect(text.startsWith('# My heading\n\n<!-- LUCI')).toBe(true);
    expect(text).toContain('./.luci/rules.md');
    expect(text).not.toContain('- Old line');
    expect(text).toContain('# My own notes\nKeep me.');
    expect(text.split('LUCI — CLAUDE CODE CONFIGURATION')).toHaveLength(2);
    expect(configureAgent('claudeCode', dir, react).action).toBe('unchanged');
  });

  it('a file without the section gets it at the top; a byte-order mark is dropped', async () => {
    const dir = tempProject({ '.cursorrules': '﻿Always use tabs.\n' });
    expect(configureAgent('cursor', dir, react).action).toBe('merged');
    const text = read(dir, '.cursorrules');
    expect(text.startsWith('<!-- LUCI — CURSOR CONFIGURATION -->')).toBe(true);
    expect(text.endsWith('<!-- END LUCI -->\n\nAlways use tabs.\n')).toBe(true);
    expect(text).not.toContain('﻿');
  });

  it('a dry run writes nothing', async () => {
    const dir = tempProject({ 'CLAUDE.md': 'mine\n' });
    expect(configureAgents(dir, react, { dryRun: true })).toMatchObject({ claudeCode: { action: 'merged' }, cursor: { action: 'created' } });
    expect(read(dir, 'CLAUDE.md')).toBe('mine\n');
    expect(fs.existsSync(path.join(dir, '.cursorrules'))).toBe(false);
  });

  it('init reports created, up to date and refreshed agent files', async () => {
    const dir = tempProject({ 'package.json': pkg() });
    expect((await initProject(dir)).created).toEqual(expect.arrayContaining(['CLAUDE.md', '.cursorrules']));
    expect((await initProject(dir)).skipped).toEqual(expect.arrayContaining(['CLAUDE.md (up to date)', '.cursorrules (up to date)']));
    fs.writeFileSync(path.join(dir, 'package.json'), pkg({ dependencies: { next: '^14' } }), 'utf8');
    const third = await initProject(dir);
    expect(third.updated).toContain('CLAUDE.md (Luci section refreshed)');
    expect(read(dir, 'CLAUDE.md')).toContain('- Framework: nextjs');
  });
});
