import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliVersion, run } from '../src/index.js';
import { fakeContext, tempDir, tempProject } from './helpers.js';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

describe('luci', () => {
  it('help lists the commands', async () => {
    const f = fakeContext(tempProject());
    expect(await run([], f.ctx)).toBe(0);
    expect(f.text()).toMatch(/init \[--dry-run\]/);
    expect(f.text()).toMatch(/doctor \[--json\]/);
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
