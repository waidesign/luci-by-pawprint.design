import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configureAgent, configureAgents, initProject } from '@luci/brain';
import { pkg, tempProject } from './helpers.js';

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const react = { framework: 'react' };

describe('agent files', () => {
  it('init writes Claude Code and Cursor files only', () => {
    const dir = tempProject({ 'package.json': pkg() });
    initProject(dir);
    expect(fs.existsSync(path.join(dir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.cursorrules'))).toBe(true);
    for (const later of ['AGENTS.md', 'GEMINI.md', 'AGENT_INSTRUCTIONS.md', '.github/copilot-instructions.md']) {
      expect(fs.existsSync(path.join(dir, later)), `${later} comes in v0.2`).toBe(false);
    }
  });

  it('every path the block points to exists after init', () => {
    const dir = tempProject({ 'package.json': pkg() });
    initProject(dir);
    const text = read(dir, 'CLAUDE.md');
    const paths = [...text.matchAll(/\.\/\.luci\/([\w./-]+?)(?=[\s,;)]|\.?\s|$)/g)].map(m => m[1] ?? '');
    expect(paths).toEqual(expect.arrayContaining(['rules.md', 'context.md', 'playbook.md', 'local/global-brain.md', 'decisions/', 'memory/proposed/']));
    for (const rel of new Set(paths)) {
      if (rel === 'local/active-task.md') continue; // written by the task commands, only while there is a task
      expect(fs.existsSync(path.join(dir, '.luci', rel)), rel).toBe(true);
    }
  });

  it('uses Luci names and markers only', () => {
    const dir = tempProject();
    configureAgents(dir, react);
    for (const file of ['CLAUDE.md', '.cursorrules']) {
      const text = read(dir, file);
      expect(text, file).toMatch(/^<!-- LUCI — (CLAUDE CODE|CURSOR) CONFIGURATION -->\n/);
      expect(text, file).toContain('<!-- END LUCI -->');
      expect(text, file).not.toMatch(/gaw|guided agent|ai-brain/i);
    }
  });

  // Ported from the prototype: project-context.test.js (with Luci's own markers)
  it('the Luci section is refreshed in place, other content kept', () => {
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

  it('a file without the section gets it at the top; a byte-order mark is dropped', () => {
    const dir = tempProject({ '.cursorrules': '﻿Always use tabs.\n' });
    expect(configureAgent('cursor', dir, react).action).toBe('merged');
    const text = read(dir, '.cursorrules');
    expect(text.startsWith('<!-- LUCI — CURSOR CONFIGURATION -->')).toBe(true);
    expect(text.endsWith('<!-- END LUCI -->\n\nAlways use tabs.\n')).toBe(true);
    expect(text).not.toContain('﻿');
  });

  it('a dry run writes nothing', () => {
    const dir = tempProject({ 'CLAUDE.md': 'mine\n' });
    expect(configureAgents(dir, react, { dryRun: true })).toMatchObject({ claudeCode: { action: 'merged' }, cursor: { action: 'created' } });
    expect(read(dir, 'CLAUDE.md')).toBe('mine\n');
    expect(fs.existsSync(path.join(dir, '.cursorrules'))).toBe(false);
  });

  it('init reports created, up to date and refreshed agent files', () => {
    const dir = tempProject({ 'package.json': pkg() });
    expect(initProject(dir).created).toEqual(expect.arrayContaining(['CLAUDE.md', '.cursorrules']));
    expect(initProject(dir).skipped).toEqual(expect.arrayContaining(['CLAUDE.md (up to date)', '.cursorrules (up to date)']));
    fs.writeFileSync(path.join(dir, 'package.json'), pkg({ dependencies: { next: '^14' } }), 'utf8');
    const third = initProject(dir);
    expect(third.updated).toContain('CLAUDE.md (Luci section refreshed)');
    expect(read(dir, 'CLAUDE.md')).toContain('- Framework: nextjs');
  });
});
