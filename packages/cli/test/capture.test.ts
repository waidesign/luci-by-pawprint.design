import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseProposal } from '@luci-dev/format';
import { CheckStore, DesignStore, FeedbackStore, initProject } from '@luci-dev/brain';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';
import { serveSites } from '../../capture/test/browser.js';

const golden = (name: string) => fs.readFileSync(fileURLToPath(new URL(`../../format/fixtures/capture/${name}`, import.meta.url)), 'utf8');
const BUTTON = 'example-com.component.primary-button.design.md';

async function project() {
  const dir = tempProject();
  await initProject(dir);
  const store = new DesignStore(dir);
  store.save(BUTTON, golden(BUTTON));
  store.save('example-com.system.typography.design.md', golden('example-com.system.typography.design.md'));
  return dir;
}
const proposals = (dir: string) => fs.readdirSync(path.join(dir, '.luci', 'memory', 'proposed')).filter(f => f !== 'README.md');

describe('luci capture: capture to rule (v0.3.2)', () => {
  it('lists the saved captures', async () => {
    const dir = await project();
    const f = fakeContext(dir);
    expect(await run(['capture'], f.ctx)).toBe(0);
    expect(f.text()).toContain(`  ${BUTTON}  (component, button, from https://example.com/pricing, 2026-11-12)`);
    expect(f.text()).toContain('luci capture rule <file>');
  });

  it('proposes a rule from a component capture, once; rules.md is never edited', async () => {
    const dir = await project();
    const rules = fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8');

    const dry = fakeContext(dir);
    expect(await run(['capture', 'rule', BUTTON, '--dry-run'], dry.ctx)).toBe(0);
    expect(dry.text()).toContain('- Proposed: Build every primary button like `.luci/design/example-com.component.primary-button.design.md`');
    expect(proposals(dir)).toEqual([]);

    const f = fakeContext(dir);
    // A path to the file works too
    expect(await run(['capture', 'rule', `.luci/design/${BUTTON}`], f.ctx)).toBe(0);
    const [file] = proposals(dir);
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}-build-every-primary-button-like-its-design-file\.md$/);
    expect(f.text()).toContain(`Proposed a rule: .luci/memory/proposed/${file}`);
    expect(f.text()).toContain('move that line into .luci/rules.md');
    const parsed = parseProposal(fs.readFileSync(path.join(dir, '.luci', 'memory', 'proposed', file!), 'utf8'));
    expect(parsed.ok && parsed.value.belongsIn).toBe('rules.md');

    // The same rule again: the waiting one, nothing new
    const again = fakeContext(dir);
    expect(await run(['capture', 'rule', BUTTON], again.ctx)).toBe(0);
    expect(again.text()).toContain(`already waiting for your review: .luci/memory/proposed/${file}`);
    expect(proposals(dir)).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, '.luci', 'rules.md'), 'utf8')).toBe(rules);
  });

  it('says what is wrong: not a component, not saved, no file named', async () => {
    const dir = await project();
    const system = fakeContext(dir);
    expect(await run(['capture', 'rule', 'example-com.system.typography.design.md'], system.ctx)).toBe(1);
    expect(system.errors()).toContain('A rule needs a component file');
    const missing = fakeContext(dir);
    expect(await run(['capture', 'rule', 'example-com.component.nope.design.md'], missing.ctx)).toBe(1);
    expect(missing.errors()).toContain('Save the capture into the project first');
    const none = fakeContext(dir);
    expect(await run(['capture', 'rule'], none.ctx)).toBe(1);
    expect(none.errors()).toContain('Name one saved capture file.');
    expect(proposals(dir)).toEqual([]);
  });
});

describe('luci capture baseline (B14) and compare (v0.4)', () => {
  it('builds the design baseline from the project stylesheets; init already did, and a rebuild reports it', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/app.css': ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\n.card { padding: var(--space-4); background: var(--brand); }\n' });
    const init = fakeContext(dir);
    expect(await run(['init', '--yes'], init.ctx)).toBe(0);
    expect(init.text()).toContain('Design baseline: 3 files from 1 stylesheet and 2 tokens');
    expect(new DesignStore(dir).list().map(f => f.file)).toContain('project.system.color.design.md');
    const f = fakeContext(dir);
    expect(await run(['capture', 'baseline'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Read 1 stylesheet and 2 custom properties.');
    expect(f.text()).toContain('Wrote .luci/design/project.system.spacing.design.md');
  });

  it('--stitch also writes the baseline as DESIGN.md at the project root, never over one without --force', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/app.css': ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\n.card { padding: var(--space-4); background: var(--brand); }\n' });
    await initProject(dir);
    const f = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--stitch'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Wrote DESIGN.md (DESIGN.md format, for Google Stitch and other DESIGN.md tools)');
    const md = fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8');
    expect(md).toMatch(/^---\nversion: alpha\nname: /);
    expect(md).toContain('primary: "#0f62fe"');
    expect(md).toContain('## Colors');
    const again = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--stitch'], again.ctx)).toBe(1);
    expect(again.errors()).toContain('DESIGN.md is already in this project. Run again with --force to replace it.');
    expect(await run(['capture', 'baseline', '--stitch', '--force'], fakeContext(dir).ctx)).toBe(0);
  });

  it('--tailwind, --tailwind-v3, and --css-vars write token baselines at the project root', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop' }), 'src/app.css': ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\n.card { padding: var(--space-4); background: var(--brand); }\n' });
    await initProject(dir);

    // --tailwind writes theme.css
    const fTailwind = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--tailwind'], fTailwind.ctx)).toBe(0);
    expect(fTailwind.text()).toContain('Wrote theme.css (Tailwind v4 @theme format)');
    const tw = fs.readFileSync(path.join(dir, 'theme.css'), 'utf8');
    expect(tw).toContain('@theme {');
    expect(tw).toContain('--color-primary: #0f62fe;');
    expect(tw).toContain('--spacing-space-4: 16px;');
    const twAgain = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--tailwind'], twAgain.ctx)).toBe(1);
    expect(twAgain.errors()).toContain('theme.css is already in this project. Run again with --force to replace it.');
    expect(await run(['capture', 'baseline', '--tailwind', '--force'], fakeContext(dir).ctx)).toBe(0);

    // --tailwind-v3 writes tailwind.config.js
    const fV3 = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--tailwind-v3'], fV3.ctx)).toBe(0);
    expect(fV3.text()).toContain('Wrote tailwind.config.js (Tailwind v3 configuration format)');
    const v3 = fs.readFileSync(path.join(dir, 'tailwind.config.js'), 'utf8');
    expect(v3).toContain('module.exports = {');
    expect(v3).toContain('"primary": "#0f62fe"');
    const v3Again = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--tailwind-v3'], v3Again.ctx)).toBe(1);
    expect(v3Again.errors()).toContain('tailwind.config.js is already in this project. Run again with --force to replace it.');

    // --css-vars writes tokens.css
    const fCss = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--css-vars'], fCss.ctx)).toBe(0);
    expect(fCss.text()).toContain('Wrote tokens.css (CSS custom properties format)');
    const css = fs.readFileSync(path.join(dir, 'tokens.css'), 'utf8');
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #0f62fe;');
    const cssAgain = fakeContext(dir);
    expect(await run(['capture', 'baseline', '--css-vars'], cssAgain.ctx)).toBe(1);
    expect(cssAgain.errors()).toContain('tokens.css is already in this project. Run again with --force to replace it.');
  });

  it('says so when a project has no stylesheets, and needs init first', async () => {
    const bare = tempProject();
    const none = fakeContext(bare);
    expect(await run(['capture', 'baseline'], none.ctx)).toBe(1);
    expect(none.errors()).toContain('run `luci init` first');
    await initProject(bare);
    const empty = fakeContext(bare);
    expect(await run(['capture', 'baseline'], empty.ctx)).toBe(0);
    expect(empty.text()).toContain('No stylesheets found in this project');
  });

  it('compares two component captures', async () => {
    const dir = await project();
    const other = golden(BUTTON).replace('name: primary-button', 'name: buy-button').replace(/border-radius 8px \(--radius-md\)/, 'border-radius 12px');
    new DesignStore(dir).save('other-example.component.buy-button.design.md', other);
    const f = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, 'other-example.component.buy-button.design.md'], f.ctx)).toBe(0);
    expect(f.text()).toContain(`# Compare: ${BUTTON} and other-example.component.buy-button.design.md`);
    const same = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, BUTTON], same.ctx)).toBe(0);
    expect(same.text()).toContain('No differences: every value compared is the same.');
    const bad = fakeContext(dir);
    expect(await run(['capture', 'compare', BUTTON, 'example-com.system.typography.design.md'], bad.ctx)).toBe(1);
    expect(bad.errors()).toContain('The second file is not a component capture');
  });

  it('lists recent design checks with open notes (v0.4.1)', async () => {
    const dir = await project();
    const empty = fakeContext(dir);
    expect(await run(['capture', 'checks'], empty.ctx)).toBe(0);
    expect(empty.text()).toContain('No design checks saved');

    const checks = new CheckStore(dir);
    checks.save({
      design: `.luci/design/${BUTTON}`, label: 'primary-button (button)', selector: '#btn', page: 'http://localhost:3000/', checkedAt: '2026-11-15T12:00:00.000Z', matches: 10,
      differences: [{ kind: 'style', part: 'container', property: 'padding', expected: '12px', actual: '6px', comment: 'Padding is still off.', priority: 'medium' }]
    });

    const fb = new FeedbackStore(dir);
    fb.add({
      page: { url: 'http://localhost:3000/' },
      target: { kind: 'element', selector: '#btn', element: 'button' },
      comment: 'Padding is still off.',
      intent: 'fix',
      priority: 'medium',
      check: { design: `.luci/design/${BUTTON}`, part: 'container', property: 'padding', expected: '12px', actual: '6px' }
    });

    const f = fakeContext(dir);
    expect(await run(['capture', 'checks'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Latest design checks (1):');
    expect(f.text()).toContain('## primary-button (button): 1 difference');
    expect(f.text()).toContain('[Note: P1-A1]');
  });

  it('validates crawl arguments (v0.4.2)', async () => {
    const dir = await project();
    const noUrls = fakeContext(dir);
    expect(await run(['capture', 'crawl'], noUrls.ctx)).toBe(1);
    expect(noUrls.errors()).toContain('Provide at least one URL or route to crawl.');

    const relNoBase = fakeContext(dir);
    expect(await run(['capture', 'crawl', '/pricing'], relNoBase.ctx)).toBe(1);
    expect(relNoBase.errors()).toContain('requires a base URL');
  });

  it('B-73: capture crawl writes DESIGN.md only with --stitch and never overwrites an existing one without --force', async () => {
    const server = await serveSites();
    try {
      // 1. Fresh project without DESIGN.md: crawl without --stitch writes .luci/design/ only
      const freshDir = await project();
      const noStitch = fakeContext(freshDir);
      expect(await run(['capture', 'crawl', '/site/', '--base', server.origin], noStitch.ctx)).toBe(0);
      expect(fs.existsSync(path.join(freshDir, 'DESIGN.md'))).toBe(false);
      expect(fs.existsSync(path.join(freshDir, '.luci', 'design', '127-0-0-1.system.typography.design.md'))).toBe(true);

      // With --stitch on a fresh project: DESIGN.md IS written
      const withStitch = fakeContext(freshDir);
      expect(await run(['capture', 'crawl', '/site/', '--base', server.origin, '--stitch'], withStitch.ctx)).toBe(0);
      expect(fs.existsSync(path.join(freshDir, 'DESIGN.md'))).toBe(true);
      expect(fs.readFileSync(path.join(freshDir, 'DESIGN.md'), 'utf8')).toContain('## Typography');

      // 2. Project with an existing hand-edited DESIGN.md
      const existingDir = await project();
      const handEdited = '# My Hand-Edited Design\nKeep me.\n';
      fs.writeFileSync(path.join(existingDir, 'DESIGN.md'), handEdited, 'utf8');

      // Crawl without --stitch leaves DESIGN.md untouched
      const keepExisting = fakeContext(existingDir);
      expect(await run(['capture', 'crawl', '/site/', '--base', server.origin], keepExisting.ctx)).toBe(0);
      expect(fs.readFileSync(path.join(existingDir, 'DESIGN.md'), 'utf8')).toBe(handEdited);

      // Crawl with --stitch (without --force) refuses to overwrite existing DESIGN.md
      const refused = fakeContext(existingDir);
      expect(await run(['capture', 'crawl', '/site/', '--base', server.origin, '--stitch'], refused.ctx)).toBe(1);
      expect(refused.errors()).toContain('--force');
      expect(fs.readFileSync(path.join(existingDir, 'DESIGN.md'), 'utf8')).toBe(handEdited);

      // Crawl with --stitch --force replaces DESIGN.md
      const forced = fakeContext(existingDir);
      expect(await run(['capture', 'crawl', '/site/', '--base', server.origin, '--stitch', '--force'], forced.ctx)).toBe(0);
      expect(fs.readFileSync(path.join(existingDir, 'DESIGN.md'), 'utf8')).toContain('## Typography');
    } finally {
      await server.close();
    }
  }, 60_000);

  it('capture crawl --storybook discovers stories from /index.json and merges them', async () => {
    const sbServer = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname === '/index.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          v: 5,
          entries: {
            'docs--intro': { id: 'docs--intro', type: 'docs' },
            'button--primary': { id: 'button--primary', type: 'story' },
            'card--default': { id: 'card--default', type: 'story' }
          }
        }));
        return;
      }
      if (u.pathname === '/iframe.html') {
        const id = u.searchParams.get('id');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          id === 'button--primary'
            ? '<!doctype html><html><body style="font-family:Inter,sans-serif;background:#ffffff;color:#111827;padding:24px"><div id="storybook-root"><button style="background:#0f62fe;color:#ffffff;padding:12px 20px;border-radius:8px;font-size:16px">Primary</button></div></body></html>'
            : '<!doctype html><html><body style="font-family:Inter,sans-serif;background:#f9fafb;color:#111827;padding:24px"><div id="storybook-root"><article style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><h2 style="font-size:24px">Card</h2><p style="font-size:14px">Details</p></article></div></body></html>'
        );
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
    await new Promise<void>(r => sbServer.listen(0, '127.0.0.1', () => r()));
    const port = (sbServer.address() as AddressInfo).port;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const dir = await project();
      const f = fakeContext(dir);
      expect(await run(['capture', 'crawl', origin, '--storybook'], f.ctx)).toBe(0);
      expect(f.text()).toContain('Discovering Storybook stories from');
      expect(f.text()).toContain('Crawled 2 of 2 pages');
      expect(fs.existsSync(path.join(dir, '.luci', 'design', '127-0-0-1.system.site-typography.design.md'))).toBe(true);
    } finally {
      await new Promise<void>(r => sbServer.close(() => r()));
    }
  }, 60_000);

  it('prints the computed layout tree of a capture (v0.4.3)', async () => {
    const dir = await project();
    const f = fakeContext(dir);
    expect(await run(['capture', 'layout', BUTTON], f.ctx)).toBe(0);
    expect(f.text()).toContain(`# Layout Tree: ${BUTTON}`);
    expect(f.text()).toContain('- **container**');

    const notFound = fakeContext(dir);
    expect(await run(['capture', 'layout', 'missing.design.md'], notFound.ctx)).toBe(1);
    expect(notFound.errors()).toContain('Not found: missing.design.md');
  });
});
