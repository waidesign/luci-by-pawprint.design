import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMANDS, cliVersion, run } from '../src/index.js';
import { fakeContext, tempDir, tempProject } from './helpers.js';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

function snapshotDir(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isDirectory()) walk(full);
      else out[rel] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}

describe('luci', () => {
  it('help lists the commands', async () => {
    const f = fakeContext(tempProject());
    expect(await run([], f.ctx)).toBe(0);
    expect(f.text()).toMatch(/init \[--dry-run\]/);
    expect(f.text()).toMatch(/doctor \[--json\]/);
  });

  it('every command and subcommand accepts --help and -h, prints usage, exits 0 and changes nothing', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'demo', dependencies: { react: '^19.0.0' } }), 'index.html': '<html><body></body></html>' });
    const commands = Object.keys(COMMANDS).filter(n => !n.startsWith('-'));
    const subcommands: string[][] = [
      ['skills', 'list'], ['skills', 'search'], ['skills', 'recommend'], ['skills', 'use'],
      ['skills', 'select'], ['skills', 'deselect'], ['skills', 'selected'], ['skills', 'add'],
      ['skills', 'mine'], ['skills', 'share'], ['skills', 'lint'], ['skills', 'pin'],
      ['skills', 'unpin'], ['skills', 'block'], ['skills', 'unblock'], ['skills', 'prefs'],
      ['skills', 'review'], ['skills', 'licenses'], ['skills', 'index'],
      ['packs', 'show'], ['packs', 'add'], ['packs', 'remove'],
      ['task', 'done'], ['toolbar', 'remove'],
      ['capture', 'checks'], ['capture', 'rule'], ['capture', 'baseline'],
      ['capture', 'compare'], ['capture', 'crawl'], ['capture', 'layout']
    ];

    for (const flag of ['--help', '-h'] as const) {
      for (const cmd of commands) {
        const before = snapshotDir(dir);
        const f = fakeContext(dir);
        const code = await run([cmd, flag], f.ctx);
        expect(code, `${cmd} ${flag}`).toBe(0);
        expect(f.errors(), `${cmd} ${flag} stderr`).toBe('');
        expect(f.text(), `${cmd} ${flag} stdout`).toMatch(/Usage: luci/);
        if (cmd === 'skills') expect(f.text()).not.toContain('No skills in category');
        expect(snapshotDir(dir), `${cmd} ${flag} must not touch files`).toEqual(before);
      }
      for (const sub of subcommands) {
        const before = snapshotDir(dir);
        const f = fakeContext(dir);
        const code = await run([...sub, flag], f.ctx);
        expect(code, `${sub.join(' ')} ${flag}`).toBe(0);
        expect(f.errors(), `${sub.join(' ')} ${flag} stderr`).toBe('');
        expect(f.text(), `${sub.join(' ')} ${flag} stdout`).toMatch(/Usage: luci/);
        expect(snapshotDir(dir), `${sub.join(' ')} ${flag} must not touch files`).toEqual(before);
      }
    }

    // Even inside an initialized project where update/start would normally rewrite files, --help must not run them
    await run(['init', '--yes'], fakeContext(dir).ctx);
    fs.unlinkSync(path.join(dir, '.luci', 'local', 'global-brain.md'));
    const initSnapshot = snapshotDir(dir);
    for (const cmd of ['update', 'start', 'init', 'toolbar'] as const) {
      const f = fakeContext(dir);
      expect(await run([cmd, '--help'], f.ctx)).toBe(0);
      expect(snapshotDir(dir), `${cmd} --help in initialized project`).toEqual(initSnapshot);
    }
  });

  it('an unknown command fails and shows help', async () => {
    const f = fakeContext(tempProject());
    expect(await run(['frobnicate'], f.ctx)).toBe(1);
    expect(f.errors()).toContain('Unknown command: frobnicate');
    expect(f.errors()).toContain('Usage: luci <command>');
  });

  it('version comes from the package', async () => {
    const f = fakeContext(tempProject());
    await run(['--version'], f.ctx);
    expect(f.text()).toBe(`luci ${cliVersion()}`);
    expect(cliVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('the built luci binary', () => {
  const luci = (cwd: string, home: string, ...args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, LUCI_HOME: home } });

  it('init --yes, then doctor, in a fresh project', () => {
    const dir = tempProject();
    const home = tempDir('luci-cli-home-');
    const init = luci(dir, home, 'init', '--yes');
    expect(init.status, init.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir, '.luci', 'rules.md'))).toBe(true);
    expect(fs.existsSync(path.join(home, 'brain', 'identity.md'))).toBe(true);

    const doctor = luci(dir, home, 'doctor');
    expect(doctor.status, doctor.stdout).toBe(0);
    expect(doctor.stdout).toContain('No problems');
  }, 60000);

  it('exits 1 on an unknown command', () => {
    expect(luci(tempProject(), tempDir(), 'nope').status).toBe(1);
  });
});
