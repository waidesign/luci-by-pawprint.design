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

  it('--agents adds Codex, Gemini CLI, Copilot or the generic file; doctor then checks them', async () => {
    const dir = tempProject();
    const f = fakeContext(dir);
    expect(await run(['init', '--yes', '--agents', 'codex,gemini'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Your agents read .luci/ through CLAUDE.md, .cursorrules, AGENTS.md and GEMINI.md');
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
    const all = fakeContext(dir);
    expect(await run(['init', '--yes', '--agents=all'], all.ctx)).toBe(0);
    expect(fs.existsSync(path.join(dir, '.github', 'copilot-instructions.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'AGENT_INSTRUCTIONS.md'))).toBe(true);
    const doc = fakeContext(dir);
    await run(['doctor'], doc.ctx);
    expect(doc.text()).toContain('.github/copilot-instructions.md');
    const bad = fakeContext(dir);
    expect(await run(['init', '--agents', 'windsurf'], bad.ctx)).toBe(1);
    expect(bad.errors()).toContain('Unknown agent "windsurf"');
  });

  it('rejects unknown options', async () => {
    const f = fakeContext(tempProject());
    expect(await run(['init', '--frobnicate'], f.ctx)).toBe(1);
    expect(f.errors()).toContain('Unknown option for init: --frobnicate');
  });

  it('prints the global install tip when luci is not on PATH (or ran via npx), plus the PowerShell tip on Windows, and neither when on PATH', async () => {
    const dir = tempProject();
    const binDir = tempProject({ 'luci': '#!/bin/sh\n', 'luci.cmd': '@echo off\r\n' });
    const npxDir = path.join(dir, '_npx', '123', 'node_modules', '.bin');
    fs.mkdirSync(npxDir, { recursive: true });
    fs.writeFileSync(path.join(npxDir, 'luci'), '', 'utf8');
    fs.writeFileSync(path.join(npxDir, 'luci.cmd'), '', 'utf8');

    // Missing from PATH on macOS/Linux: prints global install tip only
    const macNoPath = fakeContext(dir, { pathEnv: npxDir, platform: 'darwin' });
    expect(await run(['init', '--yes'], macNoPath.ctx)).toBe(0);
    expect(macNoPath.text()).toContain('Install once for short commands: npm install -g @luci-dev/cli');
    expect(macNoPath.text()).not.toContain('In PowerShell, if `luci` is blocked, use `luci.cmd`.');

    // Missing from PATH on Windows: prints both lines
    const winNoPath = fakeContext(dir, { pathEnv: npxDir, platform: 'win32' });
    expect(await run(['init', '--yes'], winNoPath.ctx)).toBe(0);
    expect(winNoPath.text()).toContain('Install once for short commands: npm install -g @luci-dev/cli');
    expect(winNoPath.text()).toContain('In PowerShell, if `luci` is blocked, use `luci.cmd`.');

    // Present on PATH: prints neither line
    const onPathWin = fakeContext(dir, { pathEnv: binDir, platform: 'win32' });
    expect(await run(['init', '--yes'], onPathWin.ctx)).toBe(0);
    expect(onPathWin.text()).not.toContain('Install once for short commands: npm install -g @luci-dev/cli');
    expect(onPathWin.text()).not.toContain('In PowerShell, if `luci` is blocked, use `luci.cmd`.');
  });
});
