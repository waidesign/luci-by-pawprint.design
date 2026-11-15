/**
 * The project design baseline (B14) on disk: stylesheets found (component <style> blocks too, never
 * dependencies or builds), three files in .luci/design/, the person's instructions kept on a rebuild.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BASELINE_FILES } from '@luci/format/capture';
import { DesignStore, findStylesheets, writeBaseline } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function project(files: Record<string, string>, withLuci = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-baseline-'));
  dirs.push(dir);
  if (withLuci) fs.mkdirSync(path.join(dir, '.luci'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text, 'utf8');
  }
  return dir;
}

const CSS = ':root { --brand: #0f62fe; --space-4: 1rem; }\nbody { font-family: Inter, sans-serif; color: #161616; }\nh1 { font-size: 2rem; }\n.card { padding: var(--space-4); background: var(--brand); }\n';

describe('finding the stylesheets', () => {
  it('reads the project\'s own CSS, Sass and component styles, never dependencies, builds or minified files', () => {
    const dir = project({
      'src/app.css': CSS,
      'src/nav.scss': '.nav { padding: 8px; }',
      'src/App.vue': '<template><p/></template>\n<style scoped lang="scss">\n.app { margin: 4px; }\n</style>',
      'node_modules/lib/x.css': '.x { color: red; }',
      'dist/app.css': '.y { color: red; }',
      'public/vendor.min.css': '.z { color: red; }'
    });
    expect(findStylesheets(dir).map(s => s.file).sort()).toEqual(['src/App.vue.scss', 'src/app.css', 'src/nav.scss']);
  });
});

describe('writing the baseline', () => {
  it('writes the three systems into .luci/design/, where agents list them', () => {
    const dir = project({ 'src/app.css': CSS });
    const r = writeBaseline(dir, { captured: '2026-11-15' });
    expect(r.written).toEqual(Object.values(BASELINE_FILES).map(f => `.luci/design/${f}`));
    expect(new DesignStore(dir).list().map(f => [f.file, f.scope, f.type])).toEqual(expect.arrayContaining([
      ['project.system.color.design.md', 'system', 'color'],
      ['project.system.spacing.design.md', 'system', 'spacing'],
      ['project.system.typography.design.md', 'system', 'typography']
    ]));
    expect(new DesignStore(dir).read(BASELINE_FILES.color)).toContain('`--brand`');
  });

  it('keeps the person\'s instructions on a rebuild, and removes a system the stylesheets no longer have', () => {
    const dir = project({ 'src/app.css': CSS });
    writeBaseline(dir, { captured: '2026-11-15' });
    const file = path.join(dir, '.luci', 'design', BASELINE_FILES.color);
    const text = fs.readFileSync(file, 'utf8').replace(/\n---\n\n/, '\n---\n\n## Your instructions\nUse --brand for every primary action.\n\n');
    fs.writeFileSync(file, text);
    writeBaseline(dir, { captured: '2026-11-16' });
    expect(fs.readFileSync(file, 'utf8')).toContain('## Your instructions\nUse --brand for every primary action.');
    // The spacing goes from the stylesheets: its file goes too
    fs.writeFileSync(path.join(dir, 'src', 'app.css'), ':root { --brand: #0f62fe; }\nbody { color: var(--brand); }\n');
    const again = writeBaseline(dir, { captured: '2026-11-16' });
    expect(again.removed).toContain(`.luci/design/${BASELINE_FILES.spacing}`);
    expect(fs.existsSync(path.join(dir, '.luci', 'design', BASELINE_FILES.spacing))).toBe(false);
  });

  it('a dry run writes nothing', () => {
    const dir = project({ 'src/app.css': CSS });
    expect(writeBaseline(dir, { dryRun: true }).written.length).toBe(3);
    expect(fs.existsSync(path.join(dir, '.luci', 'design'))).toBe(false);
  });
});
