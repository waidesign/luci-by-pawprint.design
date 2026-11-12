import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYOUT_VERSION, PRECEDENCE, parseBrainJson } from '@luci/format';
import { TEMPLATES_DIR, initProject, renderTemplate } from '@luci/brain';
import { lintLibrary } from '@luci/skills';
import { listFiles, memoryExists, pkg, readMemory, tempProject } from './helpers.js';

const reactProject = () => tempProject({
  'package.json': pkg({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { vite: '^5.0.0' } }),
  'src/App.tsx': 'export default function App() { return null; }'
});
const STARTER_SKILLS = ['code-review', 'debugging', 'implement-feature', 'security-basics', 'testing'];
const LAYOUT_FILES = [
  'README.md', 'brain.json', 'context.md', 'decisions/README.md', 'local/.gitignore', 'local/global-brain.md',
  'memory/proposed/README.md', 'playbook.md', 'project-skills.md', 'rules.md',
  ...STARTER_SKILLS.flatMap(s => [`skills/${s}/SKILL.md`, `skills/${s}/luci.json`])
].sort();
/** What init reports: files, plus each starter skill folder once. */
const REPORTED = [...LAYOUT_FILES.filter(f => !f.startsWith('skills/')), ...STARTER_SKILLS.map(s => `skills/${s}/`)].map(f => `.luci/${f}`).sort();

describe('templates', () => {
  // Ported from the prototype: brain-layout.test.js
  it('placeholders, UI-only blocks, and no hard-coded product name', async () => {
    const out = renderTemplate('A {{X}}\n<!-- if:ui -->\nUI only\n<!-- endif:ui -->\nend {{MISSING}}', { X: 'b' }, { ui: false });
    expect(out).toBe('A b\nend {{MISSING}}');
    expect(renderTemplate('<!-- if:ui -->\nUI only\n<!-- endif:ui -->\n', {}, { ui: true })).toContain('UI only');

    // Starter skills are content (Luci's own skills), not templates with placeholders
    for (const file of listFiles(TEMPLATES_DIR).filter(f => !f.startsWith('skills/'))) {
      const text = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
      expect(text, `${file} uses {{PRODUCT_NAME}}`).not.toMatch(/\bLuci\b/);
      expect(text, `${file} has no prototype names`).not.toMatch(/gaw|guided agent|ai-brain/i);
    }
    expect(fs.readFileSync(path.join(TEMPLATES_DIR, 'rules.md'), 'utf8').split('\n').length).toBeLessThan(60);
  });
});

describe('init: memory layout', () => {
  it('creates layout 1 in .luci/ with every placeholder filled', async () => {
    const dir = reactProject();
    const report = await initProject(dir);

    expect(listFiles(path.join(dir, '.luci'))).toEqual(LAYOUT_FILES);
    expect(report.created.filter(f => f.startsWith('.luci/')).sort()).toEqual(REPORTED);
    for (const file of LAYOUT_FILES) {
      const text = readMemory(dir, file);
      expect(text, file).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(text, file).not.toMatch(/gaw|ai-brain/i);
    }
    expect(readMemory(dir, 'README.md')).toContain('set up by Luci');
    // Ported from the prototype: e2e-init.test.js. Starter skills are short and lint-clean as project skills.
    const lint = lintLibrary(path.join(dir, '.luci', 'skills'));
    expect(lint.errorCount).toBe(0);
    expect(lint.warningCount, 'starter skills stay under the project-skill size budget').toBe(0);
    expect(readMemory(dir, 'project-skills.md')).toContain('(`testing`)');
  });

  it('brain.json is valid, records the stack and the precedence', async () => {
    const dir = reactProject();
    await initProject(dir, { version: '0.1.0' });
    const brain = parseBrainJson(readMemory(dir, 'brain.json'));
    if (!brain.ok) throw new Error(brain.error);
    expect(brain.value.layout).toBe(LAYOUT_VERSION);
    expect(brain.value.generatedBy).toBe('luci 0.1.0');
    expect(brain.value.project).toMatchObject({ name: 'demo', framework: 'react-vite', hasUi: true, languages: ['TypeScript'] });
    expect(brain.value.precedence).toEqual(PRECEDENCE);
  });

  it('UI projects get the UI rules, the UI playbook and the UI definition of done', async () => {
    const dir = reactProject();
    await initProject(dir);
    expect(readMemory(dir, 'rules.md')).toContain('UI changes meet the accessibility baseline');
    expect(readMemory(dir, 'playbook.md')).toContain('## UI change');
    expect(readMemory(dir, 'context.md')).toContain('390px and 1280px');
    expect(readMemory(dir, 'rules.md')).toContain('`.luci/local/`');
  });

  // Ported from the prototype: brain-layout.test.js
  it('non-UI project gets no UI rules; commands come from package.json', async () => {
    const dir = tempProject({ 'package.json': pkg({ name: 'api', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.0.0' } }) });
    await initProject(dir);

    expect(memoryExists(dir, 'design.md')).toBe(false);
    expect(readMemory(dir, 'rules.md')).not.toContain('UI changes');
    expect(readMemory(dir, 'playbook.md')).not.toContain('## UI change');
    expect(readMemory(dir, 'context.md')).toContain('- Test: `npm test`');
    expect(readMemory(dir, 'rules.md')).toContain('Run `npm test` before');
    const brain = JSON.parse(readMemory(dir, 'brain.json')) as { project: { hasUi: boolean; commands: { dev: string } } };
    expect(brain.project.hasUi).toBe(false);
    expect(brain.project.commands.dev).toBe('npm run start');
  });
});

describe('init: running again', () => {
  it('keeps files people edited and reports them as kept', async () => {
    const dir = reactProject();
    await initProject(dir);
    const rules = path.join(dir, '.luci', 'rules.md');
    fs.appendFileSync(rules, '- Use UTC everywhere\n');

    const second = await initProject(dir);
    expect(readMemory(dir, 'rules.md')).toContain('- Use UTC everywhere');
    expect(second.created).toEqual([]);
    expect(second.skipped).toContain('.luci/rules.md (exists)');
  });

  it('refreshes brain.json but keeps added keys and an edited precedence', async () => {
    const dir = reactProject();
    await initProject(dir);
    const file = path.join(dir, '.luci', 'brain.json');
    const edited = { ...JSON.parse(fs.readFileSync(file, 'utf8')) as object, owner: 'web team', precedence: ['Ours first'] };
    fs.writeFileSync(file, JSON.stringify(edited), 'utf8');
    fs.writeFileSync(path.join(dir, 'package.json'), pkg({ dependencies: { next: '^14' } }), 'utf8');

    await initProject(dir);
    const brain = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(brain['owner']).toBe('web team');
    expect(brain['precedence']).toEqual(['Ours first']);
    expect((brain['project'] as { framework: string }).framework).toBe('nextjs');
  });

  it('replaces a brain.json that is not valid JSON', async () => {
    const dir = reactProject();
    await initProject(dir);
    fs.writeFileSync(path.join(dir, '.luci', 'brain.json'), '{ broken', 'utf8');
    await initProject(dir);
    expect(parseBrainJson(readMemory(dir, 'brain.json')).ok).toBe(true);
  });

  it('--force overwrites template files', async () => {
    const dir = reactProject();
    await initProject(dir);
    fs.writeFileSync(path.join(dir, '.luci', 'playbook.md'), 'mine', 'utf8');
    await initProject(dir, { force: true });
    expect(readMemory(dir, 'playbook.md')).toContain('# Playbook');
  });
});

it('a dry run reports the files and writes nothing', async () => {
  const dir = reactProject();
  const report = await initProject(dir, { dryRun: true });
  expect(report.created).toContain('.luci/rules.md');
  expect(fs.existsSync(path.join(dir, '.luci'))).toBe(false);
});
