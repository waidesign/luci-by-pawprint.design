/**
 * `luci serve` (M6.3): the bridge between the dev toolbar and .luci/. Requests are made the way a
 * browser makes them (Origin, preflight, custom header), including the ones it must refuse.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FeedbackStore, initProject } from '@luci/brain';
import { SkillRegistry } from '@luci/skills';
import { isLoopbackOrigin, relativeSource, startBridge, type Bridge } from '../src/serve/bridge.js';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

const bridges: Bridge[] = [];
afterEach(async () => { for (const b of bridges.splice(0)) await b.close(); });

const PAGE = 'http://localhost:5173';
const target = { kind: 'element', selector: 'main > button', element: 'button', text: 'Pay now' };

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

    expect(isLoopbackOrigin('http://localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://app.localhost:3000')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:8080')).toBe(true);
    expect(isLoopbackOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLoopbackOrigin('null')).toBe(false);
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
});
