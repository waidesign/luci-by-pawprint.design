/// <reference lib="dom" />
/**
 * The dev toolbar in a real React 19 app (M6.5), driven like a person would: annotate elements and
 * text, see markers, copy the prompt, switch to Capture and save into the project. The last test is
 * M6's "Done when", automated: notes on three pages become one prompt (the same one the agent can
 * read over MCP), and the person marks them done after checking the work.
 */
import fs from 'node:fs';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { FeedbackStore, initProject } from '@luci/brain';
import { SkillRegistry } from '@luci/skills';
import { refsIn } from '@luci/format/feedback';
import { handleTool } from '../../mcp/src/index.js';
import { startBridge, type Bridge } from '../../cli/src/serve/bridge.js';
import { serveApp, type AppServer } from '../../feedback/test/app.js';

/** A project that lives for the whole file (the cli helper's projects are removed after each test). */
const projects: string[] = [];
function tempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-toolbar-project-'));
  projects.push(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return dir;
}
afterAll(() => { for (const dir of projects.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

let browser: Browser;
let app: AppServer;
let bundle: string;
beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/script.ts', import.meta.url));
  const built = build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  [browser, app, bundle] = await Promise.all([chromium.launch(), serveApp(), built.then(r => r.outputFiles[0]!.text)]);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await app?.close();
});

/** A browser context whose pages load the toolbar the way `<script src=".../toolbar.js">` does. */
async function context(bridgeUrl: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.origin });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = ${JSON.stringify(bridgeUrl)};\n${bundle}` });
  return ctx;
}
async function open(ctx: BrowserContext, route: string): Promise<Page> {
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  // Loading the app (each file transformed on request) can take longer while every test file runs at once
  page.setDefaultNavigationTimeout(20_000);
  await page.goto(`${app.origin}${route}`);
  await page.locator('[data-action="annotate"]').waitFor();
  return page;
}
const go = async (page: Page, label: string) => {
  await page.click(`nav a:text-is("${label}")`);
  await page.waitForFunction(l => document.querySelector('h1')?.textContent !== '' && location.pathname === (l === 'Home' ? '/' : `/${l.toLowerCase()}`), label);
};
/** Annotate mode: click the element, write the note, choose intent and priority, save. */
async function annotate(page: Page, selector: string, comment: string, options: { intent?: string; priority?: string } = {}) {
  if ((await page.locator('[data-action="annotate"]').getAttribute('aria-pressed')) !== 'true') await page.click('[data-action="annotate"]');
  await page.click(selector, { force: true });
  await page.fill('[data-part="comment"]', comment);
  if (options.intent) await page.selectOption('[data-part="intent"]', options.intent);
  if (options.priority) await page.selectOption('[data-part="priority"]', options.priority);
  await page.click('[data-action="save-note"]');
  await page.locator('[data-part="note-form"]').waitFor({ state: 'detached' });
}

describe('dev toolbar without luci serve (this browser only)', { timeout: 60_000 }, () => {
  it('annotates elements and text, keeps notes across reloads, copies the prompt, pauses animations', async () => {
    const ctx = await context('http://127.0.0.1:9'); // nothing listens there
    const page = await open(ctx, '/pricing');
    expect(await page.locator('[data-part="connection"]').innerText()).toBe('This browser');
    expect(await page.locator('[data-part="connection"]').getAttribute('title')).toContain('Run `luci serve`');

    // Hover names the element and its component (parity: hover shows the element's name)
    await page.click('[data-action="annotate"]');
    await page.hover('.plan:nth-of-type(2) button', { force: true });
    expect(await page.locator('[data-part="hover-label"]').innerText()).toBe('button · PlanCard');
    await annotate(page, '.plan:nth-of-type(2) button', 'Label wraps on mobile', { priority: 'high' });
    const marker = page.locator('[data-marker="P1-A1"]');
    expect(await marker.getAttribute('data-status')).toBe('new');
    // The marker sits on the button's top-right corner
    const [m, b] = await Promise.all([marker.boundingBox(), page.locator('.plan:nth-of-type(2) button').boundingBox()]);
    expect(Math.abs(m!.x + m!.width / 2 - (b!.x + b!.width))).toBeLessThan(2);

    // Select a typo: "Add feedback" appears by the selection
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const text = document.querySelector('h1')!.firstChild!;
      const range = document.createRange();
      const at = text.textContent!.indexOf('pricng');
      range.setStart(text, at);
      range.setEnd(text, at + 6);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      document.querySelector('h1')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.click('[data-action="add-selection"]');
    expect(await page.locator('[data-part="selected"]').innerText()).toBe('“pricng”');
    await page.fill('[data-part="comment"]', 'Typo: pricing');
    await page.click('[data-action="save-note"]');
    await page.locator('[data-marker="P1-A2"]').waitFor();

    // A reload keeps the notes (FR26)
    await page.reload();
    await page.locator('[data-marker="P1-A2"]').waitFor();
    expect(await page.locator('[data-action="copy-prompt"]').innerText()).toBe('Copy prompt (2 new)');

    // A saved note's intent and priority can be changed, not only its text (user request, 2026-11-13)
    await page.click('[data-marker="P1-A1"]');
    expect(await page.locator('[data-part="note-meta"]').innerText()).toBe('fix · high priority · button');
    await page.click('[data-action="edit"]');
    expect(await page.locator('[data-part="edit-note"] [data-part="comment"]').inputValue()).toBe('Label wraps on mobile');
    await page.selectOption('[data-part="edit-note"] [data-part="intent"]', 'change');
    await page.selectOption('[data-part="edit-note"] [data-part="priority"]', 'low');
    await page.click('[data-part="edit-note"] [data-action="save-note"]');
    await page.locator('[data-part="note-meta"]:text-is("change · low priority · button")').waitFor();
    await page.click('[data-action="close-item"]');

    // Copy the prompt: it holds both, and they are marked as sent (FR29)
    await page.click('[data-action="copy-prompt"]');
    const prompt = await page.locator('[data-part="prompt"]').innerText();
    expect(prompt).toMatch(/^# UI feedback: 1 page, 2 items/);
    expect(prompt).toContain('selected text: "pricng"');
    expect(prompt).toContain('source: src/components/PlanCard.jsx:6');
    // The system clipboard may change line endings (Windows); the text is the same
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').trimEnd()).toBe(prompt.trimEnd());
    expect(prompt).toContain('[P1-A1] change, low: "Label wraps on mobile"');
    expect(await page.locator('[data-marker="P1-A1"]').getAttribute('data-status')).toBe('copied');
    // Copy prompt stays available: with nothing new, it copies every note not done (user request, 2026-11-13)
    expect(await page.locator('[data-action="copy-prompt"]').isDisabled()).toBe(false);
    expect(await page.locator('[data-action="copy-prompt"]').innerText()).toBe('Copy prompt (all 2)');
    await page.click('[data-action="prompt-back"]');
    await page.click('[data-action="copy-prompt"]');
    expect(await page.locator('[data-part="prompt"]').innerText()).toMatch(/^# UI feedback: 1 page, 2 items/);
    // The ▾ menu says what each choice copies; "only new" has nothing now
    await page.click('[data-action="copy-menu"]');
    expect(await page.locator('[data-copy="new"]').isDisabled()).toBe(true);
    expect(await page.locator('[data-copy="open"]').innerText()).toContain('All notes not done (2)');
    await page.keyboard.press('Escape');
    expect(await page.locator('[data-part="copy-menu"]').count()).toBe(0);

    // Settings: marker color; pause animations on one frame (FR31)
    await page.click('[data-action="settings"]');
    await page.click('[data-color="#38bdf8"]');
    expect(await page.locator('[data-marker="P1-A1"]').evaluate(el => getComputedStyle(el).borderColor)).toBe('rgb(56, 189, 248)');
    expect(await page.evaluate(() => document.getAnimations().map(a => a.playState))).toContain('running');
    await page.click('[data-action="pause"]');
    // The page's own pulsing price stops, and runs again on Resume
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
    await page.click('[data-action="pause"]');
    await page.waitForFunction(() => document.getAnimations().some(a => a.playState === 'running'));
    await ctx.close();
  });
});

describe('webhook (FR31)', { timeout: 60_000 }, () => {
  it('sends the prompt and the items to the configured URL, only when the person presses Send', async () => {
    const received: { prompt: string; items: { ref: string }[] }[] = [];
    const hook = http.createServer((req, res) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { received.push(JSON.parse(body)); res.writeHead(200, cors).end('{}'); });
    });
    await new Promise<void>(r => hook.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/luci`;
    const ctx = await context('http://127.0.0.1:9');
    try {
      const page = await open(ctx, '/checkout');
      await annotate(page, '[role=alert]', 'Error text is too low contrast');
      await page.keyboard.press('Escape');
      await page.click('[data-action="settings"]');
      await page.fill('[data-part="webhook"]', url);
      await page.click('[data-action="save-webhook"]');
      expect(received).toEqual([]);
      await page.click('[data-action="items"]');
      await page.click('[data-action="send-webhook"]');
      expect(await page.locator('[data-part="webhook-note"]').innerText()).toBe('Sent 1 item to the webhook.');
      expect(received).toHaveLength(1);
      expect(received[0]!.prompt).toMatch(/^# UI feedback: 1 page, 1 item/);
      expect(received[0]!.items.map(i => i.ref)).toEqual(['P1-A1']);
      expect(await page.locator('[data-marker="P1-A1"]').getAttribute('data-status')).toBe('copied');
    } finally {
      await ctx.close();
      await new Promise<void>(r => { hook.closeAllConnections(); hook.close(() => r()); });
    }
  });
});

describe('connecting', { timeout: 60_000 }, () => {
  it('says "connecting to your project" while it waits for an answer, then shows the bar', async () => {
    // A server that accepts and never answers: the check waits its full time
    const sockets = new Set<net.Socket>();
    const silent = net.createServer(s => { sockets.add(s); /* never answer */ });
    await new Promise<void>(r => silent.listen(0, '127.0.0.1', () => r()));
    const ctx = await context(`http://127.0.0.1:${(silent.address() as AddressInfo).port}`);
    try {
      const page = await ctx.newPage();
      page.setDefaultTimeout(8000);
      await page.goto(`${app.origin}/`);
      const pill = page.locator('[data-part="connecting"]');
      await pill.waitFor();
      expect(await pill.innerText()).toBe('Luci: connecting to your project…');
      await page.locator('[data-action="annotate"]').waitFor();
      expect(await pill.count()).toBe(0);
      expect(await page.locator('[data-part="connection"]').getAttribute('title')).toContain('no answer within');
    } finally {
      await ctx.close();
      for (const s of sockets) s.destroy();
      await new Promise<void>(r => silent.close(() => r()));
    }
  });
});

describe('connecting later', { timeout: 60_000 }, () => {
  it('started before luci serve: the badge says why, and a click connects once it runs', async () => {
    const registry = new SkillRegistry({ user: false });
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }) });
    await initProject(dir, { registry });
    // A free port, then nothing listening on it
    const probe = await startBridge({ projectDir: dir, port: 0 });
    const port = probe.port;
    await probe.close();
    const ctx = await context(`http://127.0.0.1:${port}`);
    const page = await open(ctx, '/');
    expect(await page.locator('[data-part="connection"]').innerText()).toBe('This browser');
    await page.click('[data-action="connect"]');
    expect(await page.locator('[data-part="error"]').innerText()).toContain('Run `luci serve`');
    const late = await startBridge({ projectDir: dir, port });
    try {
      await page.click('[data-action="connect"]');
      await page.locator('[data-part="connection"]:text-is("Project")').waitFor();
      await annotate(page, 'main a.cta', 'Saved in the project now');
      expect(new FeedbackStore(dir).list().map(i => i.comment)).toEqual(['Saved in the project now']);
    } finally {
      await ctx.close();
      await late.close();
    }
  });
});

describe('dev toolbar with luci serve (M6 Done when, automated)', { timeout: 90_000 }, () => {
  let dir: string;
  let bridge: Bridge;
  const registry = new SkillRegistry({ user: false });
  const mcp = async (name: string, args: Record<string, unknown> = {}) => (await handleTool(name, args, { registry, cwd: dir })).content.map(c => c.text).join('\n');
  beforeAll(async () => {
    dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '19.3.1' } }) });
    await initProject(dir, { registry });
    bridge = await startBridge({ projectDir: dir, port: 0 });
  }, 60_000);
  afterAll(async () => { await bridge?.close(); });

  it('notes on three pages become one prompt; the person marks them done', async () => {
    const ctx = await context(bridge.url);
    const page = await open(ctx, '/');
    expect(await page.locator('[data-part="connection"]').innerText()).toBe('Project');

    // Two notes on each of three pages, moving through the app like a person
    await annotate(page, 'nav a:nth-of-type(2)', 'Use 24px between the links', { intent: 'change' });
    await annotate(page, 'main a.cta', 'Use the secondary button style', { intent: 'change', priority: 'low' });
    await page.keyboard.press('Escape');
    await go(page, 'Pricing');
    await annotate(page, '.plan:nth-of-type(2) button', 'Label wraps on mobile', { priority: 'high' });
    await annotate(page, '.plan:nth-of-type(1) h2', 'Make the plan name bolder');
    await page.keyboard.press('Escape');
    await go(page, 'Checkout');
    await annotate(page, '[role=alert]', 'Error text is too low contrast', { priority: 'high' });
    await annotate(page, 'button[type=submit]', 'Disable while the payment is sending');
    await page.keyboard.press('Escape');

    // Saved in the project, numbered by page in the order they were visited
    const store = new FeedbackStore(dir);
    expect(store.list().map(i => `${i.ref} ${i.page.route}`)).toEqual(['P1-A1 /', 'P1-A2 /', 'P2-A1 /pricing', 'P2-A2 /pricing', 'P3-A1 /checkout', 'P3-A2 /checkout']);
    expect(store.get('P3-A1')!.page.source).toBe('src/pages/Checkout.jsx');
    expect(store.get('P3-A1')!.target.source).toEqual({ file: 'src/components/FieldError.jsx', line: 2, column: 10 });

    // The person copies one prompt for the agent: 3 pages, 6 IDs, the report request (FR27, FR28)
    await page.click('[data-action="copy-prompt"]');
    const prompt = await page.locator('[data-part="prompt"]').innerText();
    expect(prompt.split('\n')[0]).toBe('# UI feedback: 3 pages, 6 items');
    expect(prompt).toContain('Do not stop after the first page.');
    expect([...prompt.matchAll(/^## Page (\d) of 3: (\S+)/gm)].map(m => m[2])).toEqual(['/', '/pricing', '/checkout']);
    expect(refsIn(prompt)).toEqual(['P1-A1', 'P1-A2', 'P2-A1', 'P2-A2', 'P3-A1', 'P3-A2']);
    expect(prompt).toContain('End with the number of items done out of 6.');
    expect(prompt).not.toContain('resolve_feedback');
    // The agent can read the same prompt (read only)
    expect((await mcp('get_feedback_prompt')).trimEnd()).toBe(prompt.trimEnd());
    expect(await page.locator('[data-marker="P3-A1"]').getAttribute('data-status')).toBe('copied');
    await page.click('[data-action="prompt-back"]');

    // After checking the agent's work, the person marks notes done: one on the page, the rest at once
    await page.click('[data-action="items"]');
    await page.click('[data-marker="P3-A1"]');
    await page.click('[data-part="item"] [data-action="mark-done"]');
    await page.locator('[data-marker="P3-A1"][data-status="done"]').waitFor();
    expect(await page.locator('[data-marker="P3-A1"]').innerText()).toBe('1✓');
    await page.click('[data-action="close-item"]');
    await page.click('[data-action="items"]');
    expect(await page.locator('[data-action="mark-copied-done"]').innerText()).toBe('Mark all copied as done (5)');
    await page.click('[data-action="mark-copied-done"]');

    // Every note done, page by page: "Not done" is empty, "Done" has all six
    await page.locator('[data-tab="open"]:text-is("Not done (0)")').waitFor();
    expect(await page.locator('[data-item]').count()).toBe(0);
    await page.click('[data-tab="done"]');
    expect(await page.locator('[data-page]').count()).toBe(3);
    expect(await page.locator('[data-item] .status').allInnerTexts()).toEqual(Array(6).fill('Done'));
    expect(JSON.parse(await mcp('list_feedback', { status: 'resolved' }))).toHaveLength(6);
    // A done note can be reopened from its row
    await page.click('[data-item="P2-A1"] [data-item-open]');
    await page.click('[data-item="P2-A1"] [data-action="reopen"]');
    await page.locator('[data-tab="open"]:text-is("Not done (1)")').waitFor();
    await page.click('[data-tab="done"]');
    await page.click('[data-action="clear-done"]');
    await page.locator('[data-tab="done"]:text-is("Done (0)")').waitFor();
    // Only the reopened note is left
    expect(new FeedbackStore(dir).list().map(i => [i.ref, i.status])).toEqual([['P2-A1', 'pending']]);
    new FeedbackStore(dir).clear('all');
    await ctx.close();
  });

  it('Capture mode saves a component file into .luci/design/, where the agent lists it', async () => {
    const ctx = await context(bridge.url);
    const page = await open(ctx, '/pricing');
    const logs: string[] = [];
    page.on('console', m => logs.push(m.text()));
    // The mode switch sits in the same place on both bars, the current mode pressed (user request, 2026-11-13)
    expect(await page.locator('[data-mode="feedback"]').getAttribute('aria-pressed')).toBe('true');
    await page.click('[data-mode="capture"]');
    await page.locator('button[data-tool="component"]').waitFor();
    expect(await page.locator('luci-toolbar .brand').innerText()).toBe('Luci');
    expect(await page.locator('luci-toolbar [data-mode="capture"]').getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('luci-toolbar [data-part="modes"] button').allInnerTexts()).toEqual(['Feedback', 'Layout', 'Capture']);
    // The mode is remembered in this tab
    await page.reload();
    await page.locator('button[data-tool="component"]').waitFor();
    await page.click('button[data-tool="component"]');
    await page.click('.plan:nth-of-type(2)', { force: true });
    await page.click('[data-output="one"]');
    const name = await page.locator('[data-part="file-name"]').innerText();
    // Connected to the project (else the console says why)
    expect(await page.locator('[data-action="save-to-project"]').count(), logs.join('\n')).toBe(1);
    await page.click('[data-action="save-to-project"]');
    expect(await page.locator('[data-part="saved"]').innerText()).toBe(`Saved .luci/design/${name}`);
    expect(fs.existsSync(path.join(dir, '.luci', 'design', name))).toBe(true);
    expect(JSON.parse(await mcp('list_captures'))).toEqual([expect.objectContaining({ file: name, scope: 'component' })]);
    // A section (v0.2): Save to project writes the section file and its component files
    await page.click('button[data-tool="component"]');
    await page.click('main > section > h1', { force: true });
    await page.click('[data-action="widen"]');
    await page.click('[data-output="section"]');
    await page.locator('[data-part="section-files"]').waitFor();
    const sectionName = await page.locator('[data-part="file-name"]').innerText();
    const parts = await page.locator('[data-part="section-files"] [data-file]').evaluateAll(els => els.map(e => e.getAttribute('data-file')!));
    await page.click('[data-action="save-to-project"]');
    expect(await page.locator('[data-part="saved"]').innerText()).toBe(`Saved .luci/design/${sectionName} and ${parts.length} component file${parts.length === 1 ? '' : 's'}`);
    for (const f of [sectionName, ...parts]) expect(fs.existsSync(path.join(dir, '.luci', 'design', f)), f).toBe(true);
    expect(JSON.parse(await mcp('list_captures'))).toEqual(expect.arrayContaining([expect.objectContaining({ file: sectionName, scope: 'section' })]));
    // Back to Feedback, then close: a small button brings Luci back
    await page.click('luci-toolbar [data-mode="feedback"]');
    await page.locator('[data-action="annotate"]').waitFor();
    await page.click('luci-feedback [data-action="close"]');
    await page.click('[data-action="open-luci"]');
    await page.locator('[data-action="annotate"]').waitFor();
    const { FEEDBACK_CSS } = await import('../../feedback/src/ui/styles.js');
    expect(FEEDBACK_CSS).not.toMatch(/#(?:fff(?:fff)?|000(?:000)?|6d28d9|a78bfa|7c3aed|ede9fe)\b/i);
    expect(FEEDBACK_CSS).not.toMatch(/rgb\(\s*(?:0\s+0\s+0|255\s+255\s+255)\b/i);
    await ctx.close();
  });
});

