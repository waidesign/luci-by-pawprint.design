/// <reference lib="dom" />
/**
 * v0.3's "Done when", automated: a built button is checked against its design.md and each
 * difference becomes a feedback note. The design is captured and saved into the project the way a
 * person would (Capture, Save to project); the check reads it back through luci serve, the built
 * button differs from it in exactly three ways, and the three notes reach the agent's prompt.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { FeedbackStore, initProject } from '@luci-dev/brain';
import { SkillRegistry } from '@luci-dev/skills';
import { refsIn } from '@luci-dev/format/feedback';
import { handleTool } from '../../mcp/src/index.js';
import { startBridge, type Bridge } from '../../cli/src/serve/bridge.js';
import { serveSites } from '../../capture/test/browser.js';
import { THREE_DIFFERENCES } from '../../capture/test/checkFixture.js';

let browser: Browser;
let site: Awaited<ReturnType<typeof serveSites>>;
let bundle: string;
let dir: string;
let bridge: Bridge;
const registry = new SkillRegistry({ user: false });
const mcp = async (name: string, args: Record<string, unknown> = {}) => (await handleTool(name, args, { registry, cwd: dir })).content.map(c => c.text).join('\n');

beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/script.ts', import.meta.url));
  const built = build({ entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  [browser, site, bundle] = await Promise.all([chromium.launch(), serveSites(), built.then(r => r.outputFiles[0]!.text)]);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-check-project-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop' }), 'utf8');
  await initProject(dir, { registry });
  bridge = await startBridge({ projectDir: dir, port: 0 });
}, 60_000);
afterAll(async () => {
  await bridge?.close();
  await browser?.close();
  await site?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function context(bridgeUrl: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.origin });
  await ctx.addInitScript({ content: `window.__LUCI_BRIDGE__ = ${JSON.stringify(bridgeUrl)};\n${bundle}` });
  return ctx;
}
async function open(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`${site.origin}/check/`);
  await page.locator('[data-action="annotate"]').waitFor();
  await page.click('[data-mode="capture"]');
  await page.locator('button[data-tool="component"]').waitFor();
  return page;
}
/** Check: pick the built button and read the result. */
async function checkBuilt(page: Page) {
  // Picking starts once the design is read (from luci serve, a moment later)
  await page.locator('[data-part="pick-layer"]').waitFor();
  await page.click('#built', { force: true });
  await page.click('[data-action="check-run"]');
  await page.locator('[data-part="check-result"]').waitFor();
}

describe('design check through the dev toolbar (v0.3 Done when)', { timeout: 90_000 }, () => {
  it('a built button checked against its design.md: each of the three differences becomes a feedback note', async () => {
    const ctx = await context(bridge.url);
    const page = await open(ctx);

    // The design: the reference button, captured and saved into the project
    await page.click('button[data-tool="component"]');
    await page.click('#design', { force: true });
    await page.click('[data-output="one"]');
    const designFile = await page.locator('[data-part="file-name"]').innerText();
    await page.click('[data-action="save-to-project"]');
    await page.locator('[data-part="saved"]').waitFor();

    // Check: the saved design, read back through luci serve, against the built button
    await page.click('[data-action="check"]');
    await page.locator(`[data-design="${designFile}"]`).waitFor();
    await page.click(`[data-design="${designFile}"] [data-design-use]`);
    await checkBuilt(page);
    expect(await page.locator('[data-part="check-summary"]').innerText()).toMatch(/· 3 differences$/);
    expect(await page.locator('[data-difference] label span').allInnerTexts()).toEqual(THREE_DIFFERENCES);

    // Each difference becomes one note on the built button, in the project
    expect(await page.locator('[data-action="check-add"]').innerText()).toBe('Add 3 as feedback notes');
    await page.click('[data-action="check-add"]');
    expect(await page.locator('[data-part="check-added"]').innerText()).toBe('Added 3 notes (P1-A1, P1-A2, P1-A3) to your project. They are in Feedback mode, ready to copy for your agent.');
    const items = new FeedbackStore(dir).list();
    expect(items.map(i => [i.ref, i.intent, i.comment])).toEqual(THREE_DIFFERENCES.map((c, i) => [`P1-A${i + 1}`, 'fix', c]));
    expect(items.every(i => i.target.selector === items[0]!.target.selector && i.target.element === 'button')).toBe(true);
    expect(items.map(i => i.check)).toEqual([
      { design: `.luci/design/${designFile}`, part: 'container', property: 'border-radius', expected: '8px (--radius)', actual: '4px' },
      { design: `.luci/design/${designFile}`, part: 'container', property: 'background-color', expected: '#0f62fe (--brand)', actual: '#2563eb' },
      { design: `.luci/design/${designFile}`, part: 'container', state: 'hover', property: 'background-color', expected: '#0353e9', actual: '#1d4ed8' }
    ]);

    // The agent's prompt lists the three, each pointing at the design file
    const prompt = await mcp('get_feedback_prompt');
    expect(refsIn(prompt)).toEqual(['P1-A1', 'P1-A2', 'P1-A3']);
    expect(prompt).toContain(`design check against .luci/design/${designFile}: container on hover, background-color: the design says #0353e9; built: #1d4ed8`);
    expect(prompt).toContain('End with the number of items done out of 3.');

    // In Feedback mode the three markers sit on the built button
    await page.click('luci-toolbar [data-mode="feedback"]');
    for (const ref of ['P1-A1', 'P1-A2', 'P1-A3']) await page.locator(`[data-marker="${ref}"]`).waitFor();
    new FeedbackStore(dir).clear('all');
    await ctx.close();
  });

  it('Make it a rule (v0.3.2): the capture is saved and a rule pointing at it waits for review; rules.md stays as it was', async () => {
    const rules = fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8');
    const ctx = await context(bridge.url);
    const page = await open(ctx);
    await page.click('button[data-tool="component"]');
    await page.click('#design', { force: true });
    await page.click('[data-output="one"]');
    const name = await page.locator('[data-part="file-name"]').innerText();
    await page.click('[data-action="make-rule"]');
    await page.locator('[data-part="rule"]').waitFor();
    expect(await page.locator('[data-action="make-rule"]').innerText()).toBe('Rule proposed');
    const line = await page.locator('[data-part="rule-text"]').innerText();
    expect(line).toMatch(new RegExp(`^Build every primary button like \`\\.luci/design/${name.replace(/\./g, '\\.')}\` \\(read it first: parts, states, motion, accessibility\\): background-color #0f62fe \\(--brand\\), `));
    expect(line).toContain('on hover background-color #0353e9');
    // Saved in the project, and the proposal holds the same line
    expect(fs.existsSync(path.join(dir, '.luci', 'design', name))).toBe(true);
    const proposed = fs.readdirSync(path.join(dir, '.luci', 'memory', 'proposed')).filter(f => f !== 'README.md');
    expect(proposed).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, '.luci', 'memory', 'proposed', proposed[0]!), 'utf8')).toContain(`- Proposed: ${line}`);
    expect(await page.locator('[data-part="rule"] .dim').innerText()).toContain(`.luci/memory/proposed/${proposed[0]}`);
    expect(fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8')).toBe(rules);
    // Only a component can become a rule
    await page.click('button[data-tool="text"]');
    await page.click('h2', { force: true });
    await page.click('[data-output="one"]');
    await page.locator('[data-part="preview"]').waitFor();
    expect(await page.locator('[data-action="make-rule"]').count()).toBe(0);
    await ctx.close();
  });

  it('without luci serve: the basket gives the design, the notes stay in this browser', async () => {
    const ctx = await context('http://127.0.0.1:9'); // nothing listens there
    const page = await open(ctx);
    await page.click('button[data-tool="component"]');
    await page.click('#design', { force: true });
    await page.click('[data-output="one"]');
    await page.click('[data-action="add-to-basket"]');
    await page.click('[data-action="check"]');
    // No project: no "Make it a rule", and only the basket and a pasted file to check against
    expect(await page.locator('[data-action="make-rule"]').count()).toBe(0);
    expect(await page.locator('[data-part="check-saved"]').count()).toBe(0);
    await page.click('[data-part="check-basket"] [data-design-use]');
    await checkBuilt(page);
    await page.click('[data-difference="1"] input');
    await page.click('[data-action="check-add"]');
    expect(await page.locator('[data-part="check-added"]').innerText()).toBe('Added 2 notes (P1-A1, P1-A2) to this browser. They are in Feedback mode, ready to copy for your agent.');
    await page.click('luci-toolbar [data-mode="feedback"]');
    await page.locator('[data-marker="P1-A2"]').waitFor();
    expect(new FeedbackStore(dir).list()).toEqual([]);
    await ctx.close();
  });
});
