/**
 * `luci serve` (M6.3): the bridge between the dev toolbar and .luci/. Requests are made the way a
 * browser makes them (Origin, preflight, custom header), including the ones it must refuse.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckStore, FeedbackStore, initProject } from '@luci-dev/brain';
import { SkillRegistry } from '@luci-dev/skills';
import { isAllowedOrigin, isExtensionOrigin, isLoopbackOrigin, relativeSource, startBridge, type Bridge } from '../src/serve/bridge.js';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

const bridges: Bridge[] = [];
afterEach(async () => { for (const b of bridges.splice(0)) await b.close(); });

const PAGE = 'http://localhost:5173';
const target = { kind: 'element' as const, selector: 'main > button', element: 'button', text: 'Pay now' };

async function project(init = true) {
  const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '19.2.1' } }) });
  if (init) await initProject(dir, { registry: new SkillRegistry({ user: false }) });
  const bridge = await startBridge({ projectDir: dir, port: 0, toolbarScript: () => 'window.luciToolbarLoaded = true;' });
  bridges.push(bridge);
  return { dir, bridge };
}

/** One request with full control over headers (fetch would not let us set Host or Origin). */
function request(bridge: Bridge, method: string, route: string, options: { body?: unknown; headers?: Record<string, string>; json?: boolean } = {}) {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = {
    origin: PAGE,
    ...(method !== 'GET' && method !== 'OPTIONS' ? { 'x-luci': '1' } : {}),
    ...(body !== undefined && options.json !== false ? { 'content-type': 'application/json' } : {}),
    ...options.headers
  };
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; json: () => any; text: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: bridge.port, method, path: route, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode!, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('luci serve: the bridge (M6.3)', () => {
  it('keeps feedback in .luci/feedback/ through the same store luci-mcp reads', async () => {
    const { dir, bridge } = await project();
    const add = (url: string, comment: string) => request(bridge, 'POST', '/feedback', { body: { page: { url, title: 'Shop' }, target, comment, intent: 'fix', priority: 'high' } });
    const a = await add(`${PAGE}/pricing`, 'Label wraps');
    expect(a.status).toBe(201);
    expect(a.json().item).toMatchObject({ ref: 'P1-A1', status: 'pending', page: { route: '/pricing' } });
    await add(`${PAGE}/checkout`, 'Disable while sending');
    await add(`${PAGE}/pricing?x=1`, 'Typo');
    expect(new FeedbackStore(dir).list().map(i => i.ref)).toEqual(['P1-A1', 'P1-A2', 'P2-A1']);
    expect(fs.readdirSync(path.join(dir, '.luci', 'feedback')).filter(f => f.endsWith('.json'))).toHaveLength(3);

    // Copying the prompt marks the items sent; the next copy has nothing new unless asked
    const prompt = (await request(bridge, 'POST', '/feedback/prompt', { body: { detail: 'compact' } })).json();
    expect(prompt.refs).toEqual(['P1-A1', 'P1-A2', 'P2-A1']);
    expect(prompt.prompt).toMatch(/^# UI feedback: 2 pages, 3 items/);
    expect((await request(bridge, 'POST', '/feedback/prompt', { body: {} })).json()).toEqual({ prompt: null, refs: [] });
    expect((await request(bridge, 'POST', '/feedback/prompt', { body: { includeSent: true } })).json().refs).toHaveLength(3);

    // The person marks a note done (after checking the agent's work), and can reopen it
    expect((await request(bridge, 'PATCH', '/feedback/P1-A2', { body: { action: 'done' } })).json().item.status).toBe('resolved');
    expect((await request(bridge, 'PATCH', '/feedback/P1-A2', { body: { action: 'reopen' } })).json().item.status).toBe('pending');
    // The old agent actions are gone
    expect((await request(bridge, 'PATCH', '/feedback/P1-A2', { body: { action: 'answer', text: 'x' } })).status).toBe(400);
    expect((await request(bridge, 'PATCH', '/feedback/P1-A1', { body: { action: 'edit', priority: 'low' } })).json().item.priority).toBe('low');
    expect((await request(bridge, 'DELETE', '/feedback/P2-A1')).json()).toEqual({ removed: ['P2-A1'] });
    expect((await request(bridge, 'DELETE', '/feedback/P2-A1')).status).toBe(404);
    expect((await request(bridge, 'GET', '/feedback')).json().items.map((i: { ref: string }) => i.ref)).toEqual(['P1-A1', 'P1-A2']);
  });

  it('keeps the latest run of each design check for the agent (v0.4, automatic design check)', async () => {
    const { dir, bridge } = await project();
    const run = (n: number, at: string) => ({
      design: '.luci/design/example-com.component.button.design.md', label: 'button (button) from example.com', selector: '#built', page: `${PAGE}/checkout`, checkedAt: at, matches: 12,
      differences: Array.from({ length: n }, (_, i) => ({ kind: 'style', part: 'container', property: `p${i}`, expected: '8px', actual: '4px', comment: `Difference ${i}.`, priority: 'medium' }))
    });
    expect((await request(bridge, 'POST', '/checks', { body: run(3, '2026-11-15T10:00:00.000Z') })).status).toBe(201);
    expect((await request(bridge, 'POST', '/checks', { body: run(1, '2026-11-15T10:05:00.000Z') })).status).toBe(201);
    const runs = (await request(bridge, 'GET', '/checks')).json().runs;
    // The same check keeps only its latest run
    expect(runs).toHaveLength(1);
    expect(runs[0].differences).toHaveLength(1);
    expect(new CheckStore(dir).list()[0]!.checkedAt).toBe('2026-11-15T10:05:00.000Z');
    expect((await request(bridge, 'POST', '/checks', { body: { design: 'x' } })).status).toBe(400);
  });

  it('automatically reconciles open feedback notes when a design check re-runs (v0.4.1, watch & auto-check)', async () => {
    const { dir, bridge } = await project();
    const fb = new FeedbackStore(dir);
    const design = '.luci/design/example-com.component.button.design.md';
    const page = { url: `${PAGE}/checkout` };
    const n1 = fb.add({
      page, target, comment: 'Background is blue', intent: 'fix', priority: 'medium',
      check: { design, part: 'container', property: 'background-color', expected: '#0f62fe', actual: '#2563eb' }
    });
    const n2 = fb.add({
      page, target, comment: 'Padding is too small', intent: 'fix', priority: 'medium',
      check: { design, part: 'container', property: 'padding', expected: '12px', actual: '4px' }
    });

    // Re-check: background-color is fixed; padding changed from 4px to 6px
    const run1 = {
      design, label: 'button (button)', selector: target.selector, page: `${PAGE}/checkout`, checkedAt: '2026-11-15T11:00:00.000Z', matches: 10,
      differences: [{ kind: 'style', part: 'container', property: 'padding', expected: '12px', actual: '6px', comment: 'Padding is still off.', priority: 'medium' }]
    };
    const res1 = await request(bridge, 'POST', '/checks', { body: run1 });
    expect(res1.status).toBe(201);
    expect(res1.json().resolved).toEqual([n1.ref]);
    expect(res1.json().updated).toEqual([n2.ref]);

    expect(fb.get(n1.ref)!.status).toBe('resolved');
    expect(fb.get(n1.ref)!.resolution).toMatch(/Resolved automatically/);
    expect(fb.get(n2.ref)!.status).toBe('pending');
    expect(fb.get(n2.ref)!.check!.actual).toBe('6px');
    expect(fb.get(n2.ref)!.comment).toBe('Padding is still off.');

    // Re-check 2: all differences resolved
    const run2 = {
      design, label: 'button (button)', selector: target.selector, page: `${PAGE}/checkout`, checkedAt: '2026-11-15T11:05:00.000Z', matches: 11,
      differences: []
    };
    const res2 = await request(bridge, 'POST', '/checks', { body: run2 });
    expect(res2.status).toBe(201);
    expect(res2.json().resolved).toEqual([n2.ref]);
    expect(fb.get(n2.ref)!.status).toBe('resolved');
  });

  it('gives the project\'s own tokens, read from its stylesheets now (v0.4, use my tokens)', async () => {
    const { dir, bridge } = await project();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'app.css'), ':root { --brand: #0f62fe; --action: var(--brand); }\n');
    const r = await request(bridge, 'GET', '/tokens');
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ tokens: [{ token: '--brand', value: '#0f62fe' }, { token: '--action', value: '#0f62fe' }], stylesheets: 1 });
    // A change shows at once
    fs.writeFileSync(path.join(dir, 'src', 'app.css'), ':root { --brand: #ff0000; }\n');
    expect((await request(bridge, 'GET', '/tokens')).json().tokens).toEqual([{ token: '--brand', value: '#ff0000' }]);
  });

  it('saves captures to .luci/design/ and refuses anything that is not a capture file', async () => {
    const { dir, bridge } = await project();
    const golden = fs.readFileSync(fileURLToPath(new URL('../../format/fixtures/capture/example-com.component.card.design.md', import.meta.url)), 'utf8');
    const ok = await request(bridge, 'POST', '/design', { body: { fileName: 'example-com.component.card.design.md', markdown: golden } });
    expect(ok.status).toBe(201);
    expect(ok.json()).toEqual({ path: '.luci/design/example-com.component.card.design.md', replaced: false });
    expect(fs.readFileSync(path.join(dir, '.luci', 'design', 'example-com.component.card.design.md'), 'utf8')).toBe(golden);
    expect((await request(bridge, 'POST', '/design', { body: { fileName: '../../evil.design.md', markdown: golden } })).status).toBe(400);
    expect((await request(bridge, 'POST', '/design', { body: { fileName: 'a.component.b.design.md', markdown: 'hello' } })).status).toBe(400);
    expect((await request(bridge, 'GET', '/design')).json().files).toHaveLength(1);
    // One file's text, for a design check (v0.3.1); only names inside .luci/design/
    expect((await request(bridge, 'GET', '/design/example-com.component.card.design.md')).json()).toEqual({ file: 'example-com.component.card.design.md', markdown: golden });
    expect((await request(bridge, 'GET', '/design/example-com.component.nope.design.md')).status).toBe(404);
    expect((await request(bridge, 'GET', `/design/${encodeURIComponent('../../package.json')}`)).status).toBe(404);
    expect((await request(bridge, 'GET', `/design/${encodeURIComponent('..\\..\\luci.json')}`)).status).toBe(404);

    // Capture to rule (v0.3.2): a proposal for rules.md, which stays as it was
    const rules = fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8');
    const rule = await request(bridge, 'POST', '/rule', { body: { file: 'example-com.component.card.design.md' } });
    expect(rule.status).toBe(201);
    expect(rule.json()).toEqual({ path: expect.stringMatching(/^\.luci\/memory\/proposed\/.+-build-every-card-like-its-design-file\.md$/), existed: false, rule: expect.stringMatching(/^Build every card like `\.luci\/design\/example-com\.component\.card\.design\.md`/) });
    expect((await request(bridge, 'POST', '/rule', { body: { file: 'example-com.component.card.design.md' } })).json().existed).toBe(true);
    expect((await request(bridge, 'POST', '/rule', { body: { file: '../../package.json' } })).status).toBe(400);
    expect((await request(bridge, 'POST', '/rule', { body: {} })).status).toBe(400);
    expect(fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8')).toBe(rules);
  });

  it('answers only pages on this machine, by its own name, and only writes with JSON and the X-Luci header', async () => {
    const { dir, bridge } = await project();
    const body = { page: { url: `${PAGE}/` }, target, comment: 'x', intent: 'fix', priority: 'low' };
    // Preflight from the app: allowed, with CORS headers for that origin only
    const pre = await request(bridge, 'OPTIONS', '/feedback', { headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-luci' } });
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe(PAGE);
    expect(pre.headers['access-control-allow-headers']).toContain('x-luci');
    // A page on the internet: refused, without CORS headers
    const evil = await request(bridge, 'POST', '/feedback', { body, headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect((await request(bridge, 'OPTIONS', '/feedback', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    // DNS rebinding: another name pointing at 127.0.0.1
    expect((await request(bridge, 'GET', '/feedback', { headers: { host: `evil.example:${bridge.port}` } })).status).toBe(403);
    // A write without the header, or not as JSON (what a plain HTML form could send)
    expect((await request(bridge, 'POST', '/feedback', { body, headers: { 'x-luci': '' } })).status).toBe(403);
    expect((await request(bridge, 'POST', '/feedback', { body, json: false, headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await request(bridge, 'POST', '/feedback', { body: { ...body, comment: '' } })).status).toBe(400);
    expect(new FeedbackStore(dir).list()).toEqual([]);

    // Browser extension origin: allowed with CORS headers
    const extOrigin = 'chrome-extension://abcdefghijklm';
    const ext = await request(bridge, 'POST', '/feedback', { body, headers: { origin: extOrigin } });
    expect(ext.status).toBe(201);
    expect(ext.headers['access-control-allow-origin']).toBe(extOrigin);
    expect(ext.headers['access-control-allow-headers']).toContain('x-luci');
    const extPre = await request(bridge, 'OPTIONS', '/feedback', { headers: { origin: extOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-luci' } });
    expect(extPre.status).toBe(204);
    expect(extPre.headers['access-control-allow-origin']).toBe(extOrigin);

    expect(isLoopbackOrigin('http://localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://app.localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:8080')).toBe(true);
    expect(isLoopbackOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLoopbackOrigin('null')).toBe(false);

    expect(isExtensionOrigin('chrome-extension://abcdefghijklm')).toBe(true);
    expect(isExtensionOrigin('moz-extension://1234-5678')).toBe(true);
    expect(isExtensionOrigin('safari-web-extension://1234-5678')).toBe(true);
    expect(isExtensionOrigin('https://example.com')).toBe(false);
    expect(isExtensionOrigin('invalid-url')).toBe(false);

    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('chrome-extension://abcdefghijklm')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  it('makes absolute source paths inside the project relative (Vite /@fs paths, React 18 _debugSource)', async () => {
    const { dir, bridge } = await project();
    const abs = path.join(dir, 'src', 'components', 'Card.jsx');
    const r = await request(bridge, 'POST', '/feedback', { body: { page: { url: `${PAGE}/`, source: path.join(dir, 'src', 'pages', 'Home.jsx') }, target: { ...target, source: { file: abs, line: 3 } }, comment: 'x', intent: 'fix', priority: 'low' } });
    expect(r.json().item.target.source).toEqual({ file: 'src/components/Card.jsx', line: 3 });
    expect(r.json().item.page.source).toBe('src/pages/Home.jsx');
    expect(relativeSource(dir, 'src/App.jsx')).toBe('src/App.jsx');
    expect(relativeSource(dir, path.join(path.dirname(dir), 'elsewhere', 'x.js'))).toBe(path.join(path.dirname(dir), 'elsewhere', 'x.js'));
  });

  it('serves the toolbar script with the bridge address, and says how to set up a project without .luci/', async () => {
    const { bridge } = await project(false);
    const script = await request(bridge, 'GET', '/toolbar.js', { headers: { origin: '' } });
    expect(script.headers['content-type']).toMatch(/javascript/);
    expect(script.text).toBe(`window.__LUCI_BRIDGE__ = "http://127.0.0.1:${bridge.port}";\nwindow.luciToolbarLoaded = true;`);
    expect((await request(bridge, 'GET', '/health')).json()).toMatchObject({ ok: true, initialized: false });
    const r = await request(bridge, 'GET', '/feedback');
    expect(r.status).toBe(409);
    expect(r.json().error).toContain('luci init');
  });

  it('`luci serve` prints how to add the toolbar, and stops cleanly', async () => {
    const dir = tempProject();
    const { ctx, text } = fakeContext(dir);
    const controller = new AbortController();
    const running = run(['serve', '--port', '0'], { ...ctx, signal: controller.signal });
    await new Promise(r => setTimeout(r, 200));
    expect(text()).toMatch(/<script src="http:\/\/127\.0\.0\.1:\d+\/toolbar\.js"><\/script>/);
    expect(text()).toContain('run `luci init` first');
    controller.abort();
    expect(await running).toBe(0);
    const bad = fakeContext(dir);
    expect(await run(['serve', '--nope'], bad.ctx)).toBe(1);
  });

  it('B-81: bridge handles malformed URI in /design/:file with 400 and body > MAX_BODY_BYTES with 413 cleanly', async () => {
    const { bridge } = await project();

    // 1. Malformed URI encoding
    const resBadUri = await request(bridge, 'GET', '/design/%ZZ');
    expect(resBadUri.status).toBe(400);
    expect(resBadUri.json().error).toMatch(/Malformed URI encoding|URI malformed/);

    // 2. Request body > MAX_BODY_BYTES (3MB) receives HTTP 413
    const bigString = 'A'.repeat(3.5 * 1024 * 1024);
    const resBig = await request(bridge, 'POST', '/feedback', {
      body: { page: { url: `${PAGE}/` }, target, comment: bigString, intent: 'fix', priority: 'low' }
    });
    expect(resBig.status).toBe(413);
    expect(resBig.json().error).toContain('The request is too large.');
  });

  it('B-81: luci serve from a subdirectory offers toolbar for project root', async () => {
    const dir = tempProject({
      'package.json': JSON.stringify({ name: 'sub-app' }),
      'index.html': '<!doctype html><html><body><div id="root"></div></body></html>'
    });
    await initProject(dir, { registry: new SkillRegistry({ user: false }) });
    const subDir = path.join(dir, 'src');
    fs.mkdirSync(subDir, { recursive: true });

    const asked: string[] = [];
    const ctxSub = {
      ...fakeContext(subDir).ctx,
      isTTY: true,
      ask: async (q: string) => { asked.push(q); return 'n'; }
    };
    const controller = new AbortController();
    const running = run(['serve', '--port', '0'], { ...ctxSub, signal: controller.signal });
    await new Promise(r => setTimeout(r, 200));
    controller.abort();
    await running;

    // offerToolbar was prompted with index.html found at root
    expect(asked.some(q => q.includes('index.html'))).toBe(true);
  });
});
