import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseDecision, parseProposal } from '@luci-dev/format';
import { CheckStore, CodeMap, DesignStore, FeedbackStore, initProject, writeActiveTask } from '@luci-dev/brain';
import { SkillRegistry } from '@luci-dev/skills';
import { TOOLS, handleTool, type ToolDeps } from '../src/index.js';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const tempProject = (files: Record<string, string> = { 'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '^18' } }) }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-mcp-project-'));
  made.push(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return dir;
};
const registry = new SkillRegistry({ user: true });
const deps = (cwd: string): ToolDeps => ({ registry, cwd });
const call = async (cwd: string, name: string, args: Record<string, unknown> = {}) => {
  const result = await handleTool(name, args, deps(cwd));
  return { ...result, text: result.content.map(c => c.text).join('\n') };
};
const initialized = async () => {
  const dir = tempProject();
  await initProject(dir, { registry });
  return dir;
};

describe('v0.4 design tools', () => {
  it('get_design_checks gives the toolbar\'s latest check runs, each difference to fix', async () => {
    const dir = await initialized();
    expect((await call(dir, 'get_design_checks')).text).toContain('No design checks yet.');
    new CheckStore(dir).save({
      design: '.luci/design/example-com.component.button.design.md', label: 'button (button) from example.com', selector: '#built', page: 'http://localhost:5173/checkout',
      checkedAt: '2026-11-15T10:05:00.000Z', matches: 12,
      differences: [{ kind: 'style', part: 'container', property: 'border-radius', expected: '8px (--radius)', actual: '4px', comment: 'Its border-radius is 4px; the design says 8px (--radius).', priority: 'medium' }]
    });
    const text = (await call(dir, 'get_design_checks')).text;
    expect(text).toContain('# Design checks: 1');
    expect(text).toContain('## button (button) from example.com: 1 difference');
    expect(text).toContain('1. Its border-radius is 4px; the design says 8px (--radius).');

    new FeedbackStore(dir).add({
      page: { url: 'http://localhost:5173/checkout' },
      target: { kind: 'element', selector: '#built', element: 'button' },
      comment: 'Fix border-radius',
      intent: 'fix',
      priority: 'medium',
      check: { design: '.luci/design/example-com.component.button.design.md', part: 'container', property: 'border-radius', expected: '8px (--radius)', actual: '4px' }
    });
    const textWithNote = (await call(dir, 'get_design_checks')).text;
    expect(textWithNote).toContain('[Note: P1-A1]');
  });

  it('crawl_site_design tool validates project and inputs (v0.4.2)', async () => {
    const uninit = tempProject();
    const resUninit = await call(uninit, 'crawl_site_design', { urls: ['http://localhost:3000/'] });
    expect(resUninit.isError).toBe(true);
    expect(resUninit.text).toContain('run `luci init`');

    const dir = await initialized();
    const resRel = await call(dir, 'crawl_site_design', { urls: ['/pricing'] });
    expect(resRel.isError).toBe(true);
    expect(resRel.text).toContain('requires a base URL');
  });

  it('get_layout_tree returns the computed layout tree of a component capture (v0.4.3)', async () => {
    const dir = await initialized();
    const golden = fs.readFileSync(fileURLToPath(new URL('../../format/fixtures/capture/example-com.component.card.design.md', import.meta.url)), 'utf8');
    new DesignStore(dir).save('example-com.component.card.design.md', golden);

    const res = await call(dir, 'get_layout_tree', { file: 'example-com.component.card.design.md' });
    expect(res.isError).toBeUndefined();
    expect(res.text).toContain('# Layout Tree: example-com.component.card.design.md');
    expect(res.text).toContain('- **container**');
    expect(res.text).toContain('image');
    expect(res.text).toContain('heading');

    const bad = await call(dir, 'get_layout_tree', { file: 'not-found.design.md' });
    expect(bad.isError).toBe(true);
  });
});

// Ported from the prototype's mcp/server.js tool list (presets and agentation are dropped)
describe('luci-mcp tools (B11)', () => {
  it('serves the ported tools plus get_active_task and propose_memory, and the feedback and capture tools (M6)', () => {
    const names = TOOLS.map(t => t.name).sort();
    expect(names).toEqual([
      'add_skill_packs', 'analyze_project', 'compare_captures', 'crawl_site_design',
      'get_active_task', 'get_capture', 'get_design_checks', 'get_feedback_prompt', 'get_global_brain', 'get_layout_tree', 'get_project_context', 'get_project_graph',
      'get_project_skills', 'get_project_status', 'get_skill', 'initialize_project', 'intake_docs', 'list_captures', 'list_feedback',
      'list_skill_packs', 'list_skills', 'load_project_skills', 'load_skills', 'propose_capture_rule', 'propose_memory', 'recommend_skills',
      'remove_skill_packs', 'search_skills', 'select_project_skills', 'update_project_memory', 'watch_feedback'
    ]);
    const readOnly = TOOLS.filter(t => t.annotations.readOnlyHint).map(t => t.name);
    expect(readOnly).toContain('get_project_context');
    expect(readOnly).toContain('compare_captures');
    expect(readOnly).toContain('get_design_checks');
    expect(readOnly).not.toContain('update_project_memory');
    for (const t of TOOLS) expect(t.description).not.toMatch(/\b(gaw|GAW|ai-brain|Guided Agent)\b/);
  });

  it('get_project_context reports a validated context, and warns when there is no .luci/', async () => {
    const dir = await initialized();
    fs.appendFileSync(path.join(dir, '.luci', 'rules.md'), '- Show every price in euros\n');
    const ctx = JSON.parse((await call(dir, 'get_project_context')).text);
    expect(ctx.initialized).toBe(true);
    expect(ctx.layout).toBe(1);
    expect(ctx.rules).toContain('Show every price in euros');
    expect(ctx.files.rules).toBe('.luci/rules.md');
    expect(ctx.skills.project.length).toBeGreaterThan(0);
    expect(ctx.skills.project[0].path).toMatch(/^\.luci\/skills\//);

    const bare = JSON.parse((await call(tempProject(), 'get_project_context')).text);
    expect(bare.initialized).toBe(false);
    expect(bare.warnings.join(' ')).toContain('luci init');
  });

  it('get_active_task returns the task file while it is active', async () => {
    const dir = await initialized();
    expect((await call(dir, 'get_active_task')).text).toContain('No active task');
    writeActiveTask(dir, '# Active Task\n\n- **Task**: Add refunds\n- **Status**: active\n- **Started**: 2026-11-12\n\n## Skills to open\n- none\n');
    const r = await call(dir, 'get_active_task');
    expect(r.isError).toBeUndefined();
    expect(r.text).toContain('Add refunds');
    expect(r.text).toContain('## Skills to open');
  });

  it('get_project_context and get_active_task from inside a monorepo sub-package (B16)', async () => {
    const root = tempProject({
      'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
      'package.json': JSON.stringify({ name: 'monorepo-root', private: true })
    });
    fs.mkdirSync(path.join(root, 'packages', 'cli'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'cli', 'package.json'), JSON.stringify({ name: '@scope/cli', bin: { cli: 'bin.js' } }), 'utf8');
    await initProject(root, { registry });
    writeActiveTask(root, '# Active Task\n\n- **Task**: Monorepo subtask\n- **Status**: active\n- **Started**: 2026-11-15\n\n## Skills to open\n- none\n');
    fs.appendFileSync(path.join(root, '.luci', 'rules.md'), '\n## Package: packages/cli\n- CLI rule 1\n');

    const cliDir = path.join(root, 'packages', 'cli');
    const ctxResult = await call(cliDir, 'get_project_context');
    const ctx = JSON.parse(ctxResult.text);
    expect(ctx.project.activePackage?.path).toBe('packages/cli');
    expect(ctx.project.activePackage?.rules).toEqual(['CLI rule 1']);
    expect(ctx.packageRules['packages/cli']).toEqual(['CLI rule 1']);

    const taskResult = await call(cliDir, 'get_active_task');
    expect(taskResult.text).toContain('Monorepo subtask');
  });

  it('update_project_memory writes a decision record, and fails loudly without .luci/', async () => {
    const bare = tempProject();
    const failed = await call(bare, 'update_project_memory', { category: 'UI', decision: 'Use euros', context: 'Shop is in Germany' });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('luci init');
    expect(failed.text).not.toContain('Recorded');
    expect(fs.existsSync(path.join(bare, '.luci'))).toBe(false);

    const dir = await initialized();
    const ok = await call(dir, 'update_project_memory', { category: 'UI', decision: 'Use euros', context: 'Shop is in Germany' });
    const file = /in (\.luci\/decisions\/\S+\.md)/.exec(ok.text)?.[1];
    expect(file).toBeDefined();
    const record = parseDecision(fs.readFileSync(path.join(dir, file!), 'utf8'));
    expect(record.ok && record.value.why).toBe('Shop is in Germany');
  });

  it('propose_memory writes a proposal the format accepts, never over an existing one', async () => {
    const dir = await initialized();
    const args = { topic: 'Prices', whatHappened: 'A price showed dollars', proposed: 'Show every price in euros', belongsIn: 'rules.md' };
    const first = await call(dir, 'propose_memory', args);
    const second = await call(dir, 'propose_memory', args);
    const files = fs.readdirSync(path.join(dir, '.luci', 'memory', 'proposed')).filter(f => f !== 'README.md');
    expect(files).toHaveLength(2);
    expect(second.text).toMatch(/-prices-2\.md/);
    expect(first.text).toContain('review');
    for (const f of files) expect(parseProposal(fs.readFileSync(path.join(dir, '.luci', 'memory', 'proposed', f), 'utf8')).ok).toBe(true);
    expect((await call(dir, 'propose_memory', { ...args, belongsIn: 'README.md' })).isError).toBe(true);
  });

  it('propose_capture_rule proposes a rule from a saved component capture (v0.3.2), never editing rules.md', async () => {
    const dir = await initialized();
    const file = 'example-com.component.primary-button.design.md';
    new DesignStore(dir).save(file, fs.readFileSync(fileURLToPath(new URL(`../../format/fixtures/capture/${file}`, import.meta.url)), 'utf8'));
    const rules = fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8');
    const r = await call(dir, 'propose_capture_rule', { file });
    expect(r.isError).toBeUndefined();
    expect(r.text).toMatch(/^Proposed in \.luci\/memory\/proposed\/\S+\.md:\nBuild every primary button like `\.luci\/design\/example-com\.component\.primary-button\.design\.md`/);
    expect((await call(dir, 'propose_capture_rule', { file })).text).toMatch(/^Already waiting for review/);
    expect(fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8')).toBe(rules);
    const missing = await call(dir, 'propose_capture_rule', { file: 'example-com.component.nope.design.md' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Save the capture into the project first');
  });

  it('write tools never create .luci/ in a project that has none', async () => {
    const bare = tempProject();
    for (const [name, args] of [
      ['propose_capture_rule', { file: 'example-com.component.card.design.md' }],
      ['select_project_skills', { ids: ['accessibility-baseline'] }],
      ['add_skill_packs', { names: ['ui'] }],
      ['propose_memory', { topic: 't', whatHappened: 'w', proposed: 'p', belongsIn: 'rules.md' }],
      ['load_project_skills', { taskPrompt: 'build a form' }],
      ['intake_docs', { files: ['package.json'] }]
    ] as const) {
      expect((await call(bare, name, args)).isError, name).toBe(true);
    }
    expect(fs.existsSync(path.join(bare, '.luci'))).toBe(false);
  });

  it('select_project_skills records the selection and refreshes the catalog', async () => {
    const dir = await initialized();
    const r = JSON.parse((await call(dir, 'select_project_skills', { ids: ['frontend-design', 'no-such-skill'], reason: 'Landing page' })).text);
    expect(r.added).toEqual(['frontend-design']);
    expect(r.unknown).toEqual(['no-such-skill']);
    expect(fs.readFileSync(path.join(dir, '.luci', 'project-skills.md'), 'utf8')).toContain('frontend-design');
    const skills = JSON.parse((await call(dir, 'get_project_skills')).text);
    expect(skills.selected.map((s: { id: string }) => s.id)).toEqual(['frontend-design']);
    expect(skills.selected[0].reason).toBe('Landing page');
  });

  it('library tools: search, get and load', async () => {
    const dir = tempProject();
    const found = JSON.parse((await call(dir, 'search_skills', { query: 'accessibility' })).text);
    expect(found.length).toBeGreaterThan(0);
    const skill = JSON.parse((await call(dir, 'get_skill', { id: found[0].id })).text);
    expect(skill.content.length).toBeGreaterThan(0);
    expect((await call(dir, 'get_skill', { id: 'no-such-skill' })).isError).toBe(true);
    expect((await call(dir, 'load_skills', { taskPrompt: 'file my quarterly taxes' })).isError).toBeUndefined();
  });

  it('get_project_graph reports the map, and builds it only when asked (never installs)', async () => {
    const dir = tempProject({ 'index.js': 'export const a = 1;' });
    expect(JSON.parse((await call(dir, 'get_project_graph')).text)).toMatchObject({ available: false });
    const writeGraph = (cwd: string) => {
      fs.mkdirSync(path.join(cwd, 'graphify-out'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'graphify-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a' }], links: [] }), 'utf8');
      return '';
    };
    const withMap = (installed: boolean): ToolDeps => ({
      ...deps(dir),
      codeMap: (d) => new CodeMap({ projectRoot: d, run: (_c, _a, cwd) => writeGraph(cwd), locate: () => (installed ? { command: 'graphify', version: 'graphify 0.0.0-test' } : null) })
    });
    const notInstalled = await handleTool('get_project_graph', { update: true }, withMap(false));
    expect(notInstalled.isError).toBe(true);
    expect(notInstalled.content[0]?.text).toContain('luci map --install');
    const built = JSON.parse((await handleTool('get_project_graph', { update: true }, withMap(true))).content[0]!.text);
    expect(built).toMatchObject({ available: true, json: 'graphify-out/graph.json', nodeCount: 1 });
  });

  it('bad input and unknown tools come back as errors, not throws', async () => {
    const dir = tempProject();
    expect((await call(dir, 'search_skills', {})).text).toContain('Invalid input for search_skills');
    expect((await call(dir, 'no_such_tool')).text).toContain('Unknown tool: no_such_tool');
    expect((await call(dir, 'add_skill_packs', { names: [] })).isError).toBe(true);
  });
});

describe('feedback and captures over MCP (M6, FR30)', () => {
  const target = { kind: 'element' as const, selector: 'main > button', element: 'button', text: 'Pay now', source: { file: 'src/pages/Checkout.jsx', line: 21 }, components: ['App', 'Checkout'] };
  const add = (dir: string, route: string, comment: string) =>
    new FeedbackStore(dir).add({ page: { url: `http://localhost:5173${route}` }, target, comment, intent: 'fix', priority: 'high' });

  it('reads only: lists the notes not done and gives the prompt, changing nothing (user request, 2026-11-13)', async () => {
    const dir = await initialized();
    expect((await call(dir, 'list_feedback')).text).toContain('No open feedback');
    add(dir, '/pricing', 'Label wraps');
    add(dir, '/checkout', 'Disable while sending');
    add(dir, '/pricing', 'Typo in heading');

    const listed = JSON.parse((await call(dir, 'list_feedback')).text) as { id: string; page: string; status: string; source: string }[];
    expect(listed.map(i => [i.id, i.page, i.status])).toEqual([['P1-A1', '/pricing', 'pending'], ['P1-A2', '/pricing', 'pending'], ['P2-A1', '/checkout', 'pending']]);
    expect(listed[0]!.source).toBe('src/pages/Checkout.jsx:21');

    const before = fs.readdirSync(path.join(dir, '.luci', 'feedback')).map(f => fs.readFileSync(path.join(dir, '.luci', 'feedback', f), 'utf8'));
    const prompt = (await call(dir, 'get_feedback_prompt')).text;
    expect(prompt).toMatch(/^# UI feedback: 2 pages, 3 items/);
    expect(prompt).toContain('## Page 2 of 2: /checkout');
    expect(prompt).not.toContain('resolve_feedback');
    // Nothing was written: statuses stay as the person left them
    expect(fs.readdirSync(path.join(dir, '.luci', 'feedback')).map(f => fs.readFileSync(path.join(dir, '.luci', 'feedback', f), 'utf8'))).toEqual(before);
    for (const name of ['list_feedback', 'get_feedback_prompt']) expect(TOOLS.find(t => t.name === name)!.annotations.readOnlyHint, name).toBe(true);
    for (const gone of ['acknowledge_feedback', 'ask_feedback_question', 'resolve_feedback', 'dismiss_feedback', 'clear_feedback']) {
      expect((await call(dir, gone, { id: 'P1-A1' })).isError, gone).toBe(true);
    }

    // The person marks one done in the toolbar: it leaves the open list
    new FeedbackStore(dir).markDone('P1-A1');
    expect(JSON.parse((await call(dir, 'list_feedback')).text).map((i: { id: string }) => i.id)).toEqual(['P1-A2', 'P2-A1']);
  });

  it('watch mode (v0.2): waits for new notes and returns only them; says when none came; reads only', async () => {
    const dir = await initialized();
    add(dir, '/pricing', 'Already there before watching');
    const watching = handleTool('watch_feedback', { seconds: 5 }, { registry, cwd: dir, watchPollMs: 20 });
    await new Promise(r => setTimeout(r, 120));
    add(dir, '/checkout', 'Disable while sending');
    const first = (await watching).content[0]!.text;
    expect(first).toMatch(/^# UI feedback: 1 page, 1 item/);
    expect(first).toContain('[P2-A1] fix, high: "Disable while sending"');
    expect(first).not.toContain('Already there');
    const since = /since "([^"]+)"/.exec(first)![1]!;
    // The next call from that time: nothing new, so it says so after its wait
    const none = (await handleTool('watch_feedback', { seconds: 1, since }, { registry, cwd: dir, watchPollMs: 20 })).content[0]!.text;
    expect(none).toBe(`No new feedback notes in 1 second. Call watch_feedback again with since "${since}" to keep watching.`);
    // A note added in between two calls is not missed
    add(dir, '/pricing', 'Typo in heading');
    const next = (await handleTool('watch_feedback', { seconds: 1, since }, { registry, cwd: dir, watchPollMs: 20 })).content[0]!.text;
    expect(next).toContain('"Typo in heading"');
    expect(next).not.toContain('Disable while sending');
    expect(TOOLS.find(t => t.name === 'watch_feedback')!.annotations.readOnlyHint).toBe(true);
    expect(new FeedbackStore(dir).list().every(i => i.status === 'pending')).toBe(true);
  });

  it('every tool says how to set up a project without .luci/, and writes nothing', async () => {
    const dir = tempProject();
    for (const name of ['list_feedback', 'get_feedback_prompt', 'list_captures', 'watch_feedback']) {
      const r = await call(dir, name);
      expect(r.isError, name).toBe(true);
      expect(r.text).toContain('luci init');
    }
    expect(fs.existsSync(path.join(dir, '.luci'))).toBe(false);
  });

  it('captures saved into .luci/design/ are listed and read; bad names and files are refused', async () => {
    const dir = await initialized();
    const golden = fs.readFileSync(fileURLToPath(new URL('../../format/fixtures/capture/example-com.component.card.design.md', import.meta.url)), 'utf8');
    const store = new DesignStore(dir);
    expect(store.save('example-com.component.card.design.md', golden)).toEqual({ path: '.luci/design/example-com.component.card.design.md', replaced: false });
    expect(store.save('example-com.component.card.design.md', golden).replaced).toBe(true);
    expect(() => store.save('../x.design.md', golden)).toThrow(/Not a capture file name/);
    expect(() => store.save('example-com.component.x.design.md', '# not a capture')).toThrow(/not a capture file/);
    const list = JSON.parse((await call(dir, 'list_captures')).text);
    expect(list).toEqual([expect.objectContaining({ file: 'example-com.component.card.design.md', name: 'card', scope: 'component', type: 'card', captured: '2026-11-13' })]);
    expect((await call(dir, 'get_capture', { file: 'example-com.component.card.design.md' })).text).toBe(golden.endsWith('\n') ? golden : `${golden}\n`);
    expect((await call(dir, 'get_capture', { file: '../../package.json' })).isError).toBe(true);
  });
});

describe('luci-mcp over stdio', () => {
  it('lists tools and answers get_project_context through the real binary', async () => {
    const dir = await initialized();
    const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin],
      cwd: dir,
      env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
      stderr: 'pipe'
    });
    const client = new Client({ name: 'luci-test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map(t => t.name)).toContain('get_project_context');
      const result = await client.callTool({ name: 'get_project_context', arguments: {} });
      const content = result.content as { type: string; text: string }[];
      const ctx = JSON.parse(content[0]!.text);
      expect(ctx.initialized).toBe(true);
      expect(fs.realpathSync(ctx.project.path)).toBe(fs.realpathSync(dir));
    } finally {
      await client.close();
    }
  }, 30000);
});
