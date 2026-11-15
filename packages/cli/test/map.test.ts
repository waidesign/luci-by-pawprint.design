import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeMap, GraphifyInstaller } from '@luci-dev/brain';
import { run } from '../src/index.js';
import { mapServices } from '../src/commands/map.js';
import { fakeContext, tempProject } from './helpers.js';

const original = { ...mapServices };
afterEach(() => Object.assign(mapServices, original));

/** No real Graphify: "installed" or not, and a run writes a small map. */
function fake(installed: boolean) {
  const runs: string[][] = [];
  mapServices.codeMap = (dir) => new CodeMap({
    projectRoot: dir,
    locate: () => (installed ? { command: 'graphify', version: 'graphify 0.0.0-test' } : null),
    run: (_command, args, cwd) => {
      runs.push([...args]);
      fs.mkdirSync(path.join(cwd, 'graphify-out'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'graphify-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] }), 'utf8');
      fs.writeFileSync(path.join(cwd, 'graphify-out', 'GRAPH_REPORT.md'), '# Report', 'utf8');
      return '';
    }
  });
  const installs: string[] = [];
  mapServices.installer = () => new GraphifyInstaller({ platform: 'linux', locate: () => null, run: (c) => { installs.push(c); } });
  return { runs, installs };
}

describe('luci map (B6)', () => {
  it('status explains how to set up a missing map', async () => {
    fake(false);
    const f = fakeContext(tempProject());
    expect(await run(['map'], f.ctx)).toBe(0);
    expect(f.text()).toContain('No code map in this project yet.');
    expect(f.text()).toContain('luci map --install');
  });

  it('--update builds the map with Graphify; without Graphify it says how to get it', async () => {
    const dir = tempProject({ 'index.js': 'export const a = 1;' });
    fake(false);
    const missing = fakeContext(dir);
    expect(await run(['map', '--update'], missing.ctx)).toBe(1);
    expect(missing.errors()).toContain('Graphify is not installed');

    const { runs } = fake(true);
    const f = fakeContext(dir);
    expect(await run(['map', '--update'], f.ctx)).toBe(0);
    expect(runs[0]).toEqual(['extract', '.', '--code-only']);
    expect(f.text()).toContain('Built the code map with Graphify (2 nodes, 1 relationships)');
    const status = fakeContext(dir);
    await run(['map'], status.ctx);
    expect(status.text()).toContain('2 nodes');
  });

  it('--install without a terminal never runs the remote uv script', async () => {
    const { installs } = fake(false);
    const f = fakeContext(tempProject(), { isTTY: false });
    expect(await run(['map', '--install'], f.ctx)).toBe(1);
    expect(installs).toEqual([]);
    expect(f.text()).toContain('To install Graphify yourself');
    expect(await run(['map', '--bogus'], fakeContext(tempProject()).ctx)).toBe(1);
  });
});
