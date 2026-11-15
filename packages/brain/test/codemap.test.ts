import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CodeMap,
  GRAPHIFY_OUT_DIR,
  GraphifyInstaller,
  diagnose,
  ensureGraphify,
  initProject,
  loadProjectContext,
  locateGraph,
  mapFreshness,
  updateProject,
  uvInstallCommand,
  type RunCommand
} from '@luci-dev/brain';
import { tempProject } from './helpers.js';

const makeProject = () => tempProject({
  'index.js': `import { helper } from './utils.js';\nexport function main() { return helper(); }`,
  'utils.js': 'export function helper() { return 42; }'
});

// A graph in Graphify's own format (edges stored as `links`)
function writeOfficialGraph(dir: string, extra: Record<string, unknown> = {}) {
  const out = path.join(dir, GRAPHIFY_OUT_DIR);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'graph.json'), JSON.stringify({
    directed: true,
    nodes: [{ id: 'main' }, { id: 'helper' }, { id: 'utils.js' }],
    links: [{ source: 'main', target: 'helper' }, { source: 'helper', target: 'utils.js' }],
    ...extra
  }), 'utf8');
  fs.writeFileSync(path.join(out, 'GRAPH_REPORT.md'), '# Graph Report', 'utf8');
  fs.writeFileSync(path.join(out, 'graph.html'), '<html></html>', 'utf8');
}

/** Stands in for the Graphify CLI so tests don't depend on what is installed. */
function fakeGraphify(options: { installed?: boolean; writesOutput?: boolean } = {}) {
  const calls: string[][] = [];
  const run: RunCommand = (_command, args, cwd) => {
    calls.push([...args]);
    if (options.writesOutput ?? true) writeOfficialGraph(cwd);
    return '';
  };
  const locate = () => ((options.installed ?? true) ? { command: 'graphify', version: 'graphify 0.0.0-test' } : null);
  return { calls, make: (dir: string) => new CodeMap({ projectRoot: dir, run, locate }) };
}

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Luci Test', '-c', 'user.email=test@example.invalid', ...args], { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();
/** Make a file's modification time later than the graph's, so the test does not depend on clock resolution. */
const touchLater = (dir: string, file: string) => {
  const later = new Date(fs.statSync(path.join(dir, GRAPHIFY_OUT_DIR, 'graph.json')).mtimeMs + 5000);
  fs.utimesSync(path.join(dir, file), later, later);
};

// Ported from the prototype: graphify.test.js
describe('code map (B6)', () => {
  it('skips (does not fail) when Graphify is not installed', async () => {
    const dir = makeProject();
    const fake = fakeGraphify({ installed: false });
    const result = await fake.make(dir).generate({ targetDir: dir });
    expect(result.skipped).toBe(true);
    expect(result.summary).toContain('luci map --install');
    expect(fake.calls).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, GRAPHIFY_OUT_DIR))).toBe(false);
  });

  it('builds the map in graphify-out/ in code-only mode and reads Graphify `links`', async () => {
    const dir = makeProject();
    const fake = fakeGraphify();
    const result = await fake.make(dir).generate({ targetDir: dir });
    if (result.skipped) throw new Error('expected a map');
    expect(result.reused).toBe(false);
    expect(result.jsonPath).toBe(path.join(dir, GRAPHIFY_OUT_DIR, 'graph.json'));
    expect([result.nodeCount, result.edgeCount]).toEqual([3, 2]);
    expect(fake.calls[0]).toEqual(['extract', '.', '--code-only']);
    expect(fake.calls[1]).toEqual(['cluster-only', '.', '--no-label']);
  });

  it('reuses an existing map, refreshes it incrementally, and rebuilds on request', async () => {
    const dir = makeProject();
    writeOfficialGraph(dir);
    const fake = fakeGraphify();
    const map = fake.make(dir);
    expect((await map.generate({ targetDir: dir })) ).toMatchObject({ reused: true });
    expect(fake.calls).toHaveLength(0);
    expect(await map.generate({ targetDir: dir, force: true })).toMatchObject({ reused: false, mode: 'incremental' });
    expect(fake.calls.at(-1)).toEqual(['update', '.']);
    expect(await map.generate({ targetDir: dir, full: true })).toMatchObject({ mode: 'full' });
  });

  it('errors when Graphify produces no map, and only finds graphify-out/graph.json', async () => {
    const dir = makeProject();
    await expect(fakeGraphify({ writesOutput: false }).make(dir).generate({ targetDir: dir })).rejects.toThrow(/produced no usable map/);
    fs.writeFileSync(path.join(dir, 'graph.json'), '{"nodes":[{"id":"x"}]}', 'utf8');
    expect(locateGraph(dir)).toBeNull();
  });
});

// These spawn git many times; under a full parallel run (with Chromium) that can take several seconds
describe('code map freshness against git (B6)', { timeout: 30_000 }, () => {
  it('is current right after a build, stale once code changes, and ignores non-code files', () => {
    const dir = makeProject();
    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'first');
    expect(mapFreshness(dir).status).toBe('missing');

    writeOfficialGraph(dir, { built_at_commit: git(dir, 'rev-parse', 'HEAD') });
    expect(mapFreshness(dir).status).toBe('fresh');

    fs.writeFileSync(path.join(dir, 'notes.md'), '# not code', 'utf8');
    touchLater(dir, 'notes.md');
    expect(mapFreshness(dir).status).toBe('fresh');

    fs.appendFileSync(path.join(dir, 'utils.js'), '\nexport const two = 2;\n');
    touchLater(dir, 'utils.js');
    expect(mapFreshness(dir)).toMatchObject({ status: 'stale', changedFiles: 1, sample: ['utils.js'] });

    // Committed after the build: still stale until the map is rebuilt
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'second');
    expect(mapFreshness(dir).status).toBe('stale');
  });

  it('without git the answer is unknown, not a guess', () => {
    const dir = makeProject();
    writeOfficialGraph(dir);
    expect(mapFreshness(dir).status).toBe('unknown');
  });

  it('doctor, project context and update use it; update refreshes only a stale map', async () => {
    const dir = makeProject();
    await initProject(dir);
    expect((await diagnose(dir)).checks.find(c => c.label === 'Code map')?.status).toBe('info');

    git(dir, 'init', '-q');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'first');
    writeOfficialGraph(dir, { built_at_commit: git(dir, 'rev-parse', 'HEAD') });
    fs.appendFileSync(path.join(dir, 'index.js'), '\n// changed\n');
    touchLater(dir, 'index.js');

    expect((await diagnose(dir)).checks.find(c => c.label === 'Code map')).toMatchObject({ status: 'warn', fix: expect.stringContaining('luci map --update') });
    const ctx = await loadProjectContext(dir);
    expect(ctx.graph.available && ctx.graph.freshness.status).toBe('stale');
    expect(ctx.warnings.join(' ')).toContain('code map is out of date');

    const fake = fakeGraphify();
    const report = await updateProject(dir, { codeMap: fake.make(dir) });
    expect(fake.calls[0]).toEqual(['update', '.']);
    expect(report.codeMap).toContain('Updated the code map');
  });
});

// Ported from the prototype: graphify-setup.test.js
describe('installing Graphify needs consent (B6)', () => {
  const fakeCodeMap = () => {
    const state = { installed: false };
    return { state, getCliVersion: () => (state.installed ? 'graphify 0.0.0-test' : null) };
  };
  const fakeInstaller = (codeMap: ReturnType<typeof fakeCodeMap>, options: { hasUv?: boolean; fails?: boolean } = {}) => {
    const ran: string[] = [];
    let uv = options.hasUv ?? true;
    const installer = new GraphifyInstaller({
      platform: 'linux',
      locate: (name) => (name === 'uv' && uv ? { command: '/home/u/.local/bin/uv', version: 'uv 0.0.0' } : null),
      run: (command) => {
        if (options.fails) throw new Error('network down');
        ran.push(command);
        if (command === uvInstallCommand('linux')) uv = true;
        if (command.includes('tool install graphifyy')) codeMap.state.installed = true;
      }
    });
    return { installer, ran };
  };
  const answers = (...list: boolean[]) => {
    const asked: string[] = [];
    return { asked, ask: async (q: string) => { asked.push(q); return list.shift() ?? false; } };
  };

  it('does nothing when Graphify is installed; a "no" installs nothing', async () => {
    const installed = fakeCodeMap();
    installed.state.installed = true;
    const a = fakeInstaller(installed);
    expect(await ensureGraphify({ codeMap: installed, installer: a.installer, ask: answers().ask })).toMatchObject({ available: true, installed: false });
    expect(a.ran).toEqual([]);

    const missing = fakeCodeMap();
    const b = fakeInstaller(missing);
    const logs: string[] = [];
    const q = answers(false);
    expect(await ensureGraphify({ codeMap: missing, installer: b.installer, ask: q.ask, log: l => logs.push(l) })).toMatchObject({ available: false, declined: true });
    expect(b.ran).toEqual([]);
    expect(logs.join('\n')).toContain('saves');
  });

  it('a "yes" with uv present installs Graphify with uv; a missing uv is asked about separately', async () => {
    const cm = fakeCodeMap();
    const a = fakeInstaller(cm);
    expect(await ensureGraphify({ codeMap: cm, installer: a.installer, ask: answers(true).ask })).toMatchObject({ available: true, installed: true });
    expect(a.ran).toEqual(['"/home/u/.local/bin/uv" tool install graphifyy']);

    const cm2 = fakeCodeMap();
    const b = fakeInstaller(cm2, { hasUv: false });
    const q = answers(true, false);
    expect(await ensureGraphify({ codeMap: cm2, installer: b.installer, ask: q.ask })).toMatchObject({ available: false });
    expect(q.asked[1]).toContain('uv');
    expect(b.ran).toEqual([]);
  });

  it('with no one to answer it never runs the remote uv script; explicit opt-in installs both', async () => {
    const cm = fakeCodeMap();
    const a = fakeInstaller(cm, { hasUv: false });
    expect((await ensureGraphify({ codeMap: cm, installer: a.installer, ask: null, confirmGraphify: false })).available).toBe(false);
    expect(a.ran).toEqual([]);

    const b = fakeInstaller(cm, { hasUv: false });
    expect((await ensureGraphify({ codeMap: cm, installer: b.installer, ask: null, confirmGraphify: false, confirmUv: false })).available).toBe(true);
    expect(b.ran).toHaveLength(2);
  });

  it('reports a failed install without throwing, and uses Astral\'s official uv script', async () => {
    const cm = fakeCodeMap();
    const { installer } = fakeInstaller(cm, { fails: true });
    expect(await ensureGraphify({ codeMap: cm, installer, ask: async () => true })).toMatchObject({ available: false, error: 'network down' });
    expect(uvInstallCommand('win32')).toContain('https://astral.sh/uv/install.ps1');
    expect(uvInstallCommand('darwin')).toContain('https://astral.sh/uv/install.sh');
  });
});
