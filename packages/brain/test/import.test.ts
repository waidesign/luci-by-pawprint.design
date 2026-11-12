import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDecision } from '@luci/format';
import { SkillRegistry } from '@luci/skills';
import { TEMPLATES_DIR, diagnose, importPrototype, matchesTemplate, renameText } from '@luci/brain';
import { listFiles, tempDir, tempProject } from './helpers.js';

const SNAPSHOT = fileURLToPath(new URL('../import-snapshot/', import.meta.url));
const OLD = 'ai-brain';
const registry = new SkillRegistry({ user: true });

/** The prototype's template, filled in the way the prototype filled it. */
function fill(file: string): string {
  return fs.readFileSync(path.join(SNAPSHOT, 'templates', file), 'utf8')
    .replace(/<!-- (?:end)?if:\w+ -->\n?/g, '')
    .replace('{{PROTECTED_PATHS}}', '  - Lockfiles: change only through the package manager.\n  - Generated output: `graphify-out/`, `ai-brain/local/`. Change the source, not the output.\n  - Secrets: `.env*`. Never print them.')
    .replace(/\{\{[A-Z_]+\}\}/g, 'shop');
}

/** A Luci starter skill written back in the prototype's format. */
function oldStarter(id: string): Record<string, string> {
  const dir = path.join(TEMPLATES_DIR, 'skills', id);
  const skill = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/^(\s*)luci-/gm, '$1gaw-').replace('gaw-author: "Luci"', 'gaw-author: "GAW"').replace(/\.luci\//g, 'ai-brain/');
  const contract = JSON.parse(fs.readFileSync(path.join(dir, 'luci.json'), 'utf8')) as Record<string, unknown>;
  const { lss: _lss, ...rest } = contract;
  return { [`${OLD}/skills/${id}/SKILL.md`]: skill, [`${OLD}/skills/${id}/gaw.json`]: JSON.stringify({ gss: 1, ...rest }) };
}

function prototypeProject(): string {
  const context = fill('context.md').replace(/## Project Goal\n[^\n]*/, '## Project Goal\nA shop for hand-made shoes.');
  const rules = `${fill('rules.md').trimEnd()}\n- Show every price in euros.\n`;
  return tempProject({
    'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '^18' } }),
    [`${OLD}/context.md`]: context,
    [`${OLD}/rules.md`]: rules,
    [`${OLD}/playbook.md`]: fill('playbook.md'),
    [`${OLD}/README.md`]: fill('README.md'),
    [`${OLD}/brain.json`]: JSON.stringify({ layout: 2, generatedBy: 'guided-agent-workflow 1.0.0' }),
    [`${OLD}/project-skills.md`]: '# generated',
    [`${OLD}/skills.lock.json`]: JSON.stringify({ gss: 1, skills: [{ id: 'frontend-design', version: '1.0.0', reason: 'Landing page', addedAt: '2026-11-01' }, { id: 'not-in-luci', version: '1.0.0', reason: 'x', addedAt: '2026-11-01', from: 'https://github.com/someone/skills' }] }),
    [`${OLD}/decisions/2026-11-01-use-euros.md`]: '# Use euros\n\n- Date: 2026-11-01\n- Status: accepted\n- Area: Product\n\n## What\nPrices in euros.\n\n## Why\nThe shop is in Germany. Recorded with `gaw` in ai-brain/.\n\n## Alternatives considered\n_Not recorded._\n',
    [`${OLD}/decisions/README.md`]: '# old readme',
    [`${OLD}/memory/proposed/2026-11-02-sizes.md`]: '# Sizes\n\n- What happened: x\n- Proposed: EU sizes\n- Belongs in: rules.md\n',
    [`${OLD}/local/active-task.md`]: '# Active Task\n\n- **Task**: Add refunds\n- **Status**: active\n- **Started**: 2026-11-10\n\n## Skills to open\n- `ai-brain/skills/testing/SKILL.md`\n',
    [`${OLD}/local/global-brain.md`]: '# Global Brain (summary)\nold',
    [`${OLD}/design.md`]: '# Design\n\nWarm colours.',
    ...oldStarter('testing'),
    [`${OLD}/skills/brand-voice/SKILL.md`]: '---\nname: brand-voice\ndescription: How the shop talks to customers.\ngaw-title: "Brand Voice"\ngaw-author: "Shop team"\n---\n\nUse short sentences. See ai-brain/rules.md.\n',
    [`${OLD}/skills/brand-voice/gaw.json`]: JSON.stringify({ gss: 1, summary: 'Tone of voice', keywords: ['tone', 'copy'] }),
    'CLAUDE.md': '<!-- GUIDED AGENT WORKFLOW — CLAUDE CODE CONFIGURATION -->\n# Old\n- Rules: ./ai-brain/rules.md\n<!-- END GUIDED AGENT WORKFLOW -->\n\n# Our notes\nKeep me.\n',
    'AGENTS.md': '<!-- GUIDED AGENT WORKFLOW — CODEX CONFIGURATION -->\n# Old\n<!-- END GUIDED AGENT WORKFLOW -->\n'
  });
}

function prototypeHome(): string {
  const home = tempDir('luci-proto-home-');
  const brain = path.join(home, 'brain');
  fs.mkdirSync(brain);
  fs.copyFileSync(path.join(SNAPSHOT, 'brain', 'lessons-learned.md'), path.join(brain, 'lessons-learned.md')); // as shipped
  fs.writeFileSync(path.join(brain, 'design-principles.md'), '# Design Principles\n\n- I like generous whitespace.\n', 'utf8'); // edited
  fs.writeFileSync(path.join(brain, 'decision-history.md'), '# Global Decision History\n\n| Timestamp | Category | Decision | Context |\n|---|---|---|---|\n| 2026-11-01 | UI | Prefer Inter | Readable |\n', 'utf8');
  return home;
}

const read = (dir: string, rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('luci import (B13)', () => {
  it('merges memory files: template text becomes Luci\'s, edited sections are kept', async () => {
    const dir = prototypeProject();
    const report = await importPrototype(dir, { registry, prototypeHome: prototypeHome(), globalBrainDir: tempDir() });
    expect(report.blocked).toBeNull();
    expect(report.merged).toEqual([
      { file: '.luci/context.md', kept: ['Project Goal'] },
      { file: '.luci/rules.md', kept: ['Project-Specific Rules'] },
      { file: '.luci/playbook.md', kept: [] },
      { file: '.luci/README.md', kept: [] }
    ]);
    const context = read(dir, '.luci/context.md');
    expect(context).toContain('A shop for hand-made shoes.');
    expect(context).toContain('## Stack (auto-detected)');
    expect(read(dir, '.luci/rules.md')).toContain('- Show every price in euros.');
    // The auto-detected Folder Map lists the old folder until the user deletes it (then `luci update` drops it)
    for (const f of ['context.md', 'rules.md', 'playbook.md', 'README.md']) {
      expect(read(dir, `.luci/${f}`).replace(/^- `ai-brain\/`.*$/m, ''), f).not.toMatch(/\bgaw\b|GAW|ai-brain|Guided Agent/);
    }
  });

  it('copies history word for word, renames the active task\'s paths, and converts skills and the lock', async () => {
    const dir = prototypeProject();
    const report = await importPrototype(dir, { registry, prototypeHome: prototypeHome(), globalBrainDir: tempDir() });
    // Decisions are history: unchanged, and still readable
    const decision = read(dir, '.luci/decisions/2026-11-01-use-euros.md');
    expect(decision).toBe(read(dir, `${OLD}/decisions/2026-11-01-use-euros.md`));
    expect(parseDecision(decision).ok).toBe(true);
    expect(read(dir, '.luci/decisions/README.md')).not.toBe('# old readme');
    expect(read(dir, '.luci/memory/proposed/2026-11-02-sizes.md')).toContain('EU sizes');
    expect(read(dir, '.luci/design.md')).toContain('Warm colours.');
    expect(read(dir, '.luci/local/active-task.md')).toContain('`.luci/skills/testing/SKILL.md`');
    expect(read(dir, '.luci/local/global-brain.md')).not.toContain('old');

    expect(report.skills).toEqual({ kept: ['brand-voice'], replacedByLuci: ['testing'] });
    expect(read(dir, '.luci/skills/testing/SKILL.md')).toBe(read(TEMPLATES_DIR, 'skills/testing/SKILL.md'));
    const voice = read(dir, '.luci/skills/brand-voice/SKILL.md');
    expect(voice).toContain('luci-title: "Brand Voice"');
    expect(voice).toContain('luci-author: "Shop team"');
    expect(voice).toContain('See .luci/rules.md.');
    expect(JSON.parse(read(dir, '.luci/skills/brand-voice/luci.json'))).toEqual({ lss: 1, summary: 'Tone of voice', keywords: ['tone', 'copy'] });
    expect(fs.existsSync(path.join(dir, '.luci/skills/brand-voice/gaw.json'))).toBe(false);

    const lock = JSON.parse(read(dir, '.luci/skills.lock.json'));
    expect(lock.lss).toBe(1);
    expect(lock.skills.map((s: { id: string }) => s.id)).toEqual(['frontend-design', 'not-in-luci']);
    expect(report.lock.notInLibrary).toEqual(['not-in-luci']);
    expect(read(dir, '.luci/project-skills.md')).toContain('frontend-design');
  });

  it('replaces the old agent sections and keeps the rest of each file', async () => {
    const dir = prototypeProject();
    await importPrototype(dir, { registry, prototypeHome: prototypeHome(), globalBrainDir: tempDir() });
    const claude = read(dir, 'CLAUDE.md');
    expect(claude).toContain('<!-- LUCI — CLAUDE CODE CONFIGURATION -->');
    expect(claude).toContain('./.luci/rules.md');
    expect(claude).toContain('# Our notes\nKeep me.');
    expect(claude).not.toMatch(/GUIDED AGENT WORKFLOW|ai-brain/);
    expect(read(dir, 'AGENTS.md')).toContain('<!-- LUCI — CODEX CONFIGURATION -->');
    expect(read(dir, '.cursorrules')).toContain('<!-- LUCI — CURSOR CONFIGURATION -->');
    expect((await diagnose(dir, { registry })).checks.filter(c => c.status === 'fail')).toEqual([]);
  });

  it('carries over Global Brain files the user changed, never ones still as shipped or already changed in Luci', async () => {
    const globalBrainDir = tempDir();
    fs.writeFileSync(path.join(globalBrainDir, 'design-principles.md'), '# Mine already\n', 'utf8');
    const report = await importPrototype(prototypeProject(), { registry, prototypeHome: prototypeHome(), globalBrainDir });
    expect(report.globalBrain.copied).toEqual(['decision-history.md']);
    expect(report.globalBrain.keptYours).toEqual(['design-principles.md']);
    expect(read(globalBrainDir, 'design-principles.md')).toBe('# Mine already\n');
    expect(read(globalBrainDir, 'decision-history.md')).toContain('Prefer Inter');

    const fresh = tempDir();
    const second = await importPrototype(prototypeProject(), { registry, prototypeHome: prototypeHome(), globalBrainDir: fresh });
    expect(second.globalBrain.copied).toEqual(['decision-history.md', 'design-principles.md']);
    expect(read(fresh, 'design-principles.md')).toContain('generous whitespace');
  });

  it('a dry run writes nothing; import refuses to run twice or without the old folder; nothing is deleted', async () => {
    const dir = prototypeProject();
    const before = listFiles(dir);
    const dry = await importPrototype(dir, { dryRun: true, registry, prototypeHome: prototypeHome(), globalBrainDir: tempDir() });
    expect(dry.merged).toHaveLength(4);
    expect(listFiles(dir)).toEqual(before);

    await importPrototype(dir, { registry, prototypeHome: prototypeHome(), globalBrainDir: tempDir() });
    expect(fs.existsSync(path.join(dir, OLD, 'context.md'))).toBe(true);
    expect((await importPrototype(dir, { registry })).blocked).toContain('already has .luci/');
    expect((await importPrototype(tempProject(), { registry })).blocked).toContain('nothing to import');
  });

  it('templates match with placeholders filled, but an added protected path is not matched away', () => {
    const tpl = '- Protected paths:\n{{PROTECTED_PATHS}}\n- Ask first.';
    const generated = '- Protected paths:\n  - Lockfiles: x\n  - Generated output: y\n  - Secrets: z\n- Ask first.';
    expect(matchesTemplate(generated, tpl)).toBe(true);
    expect(matchesTemplate(generated.replace('  - Secrets: z', '  - Secrets: z\n  - Our payments folder'), tpl)).toBe(false);
    expect(renameText('Run `gaw update`; see ai-brain/rules.md and ~/.gaw/brain (GAW_HOME). The gaw source folder stays.'))
      .toBe('Run `luci update`; see .luci/rules.md and ~/.luci/brain (LUCI_HOME). The gaw source folder stays.');
  });

  it('only the import code names the prototype', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const offenders = ['format', 'skills', 'brain', 'cli', 'mcp']
      .flatMap(pkg => listFiles(path.join(root, pkg, 'src')).map(f => `${pkg}/src/${f}`))
      .filter(f => f.endsWith('.ts') && f !== 'brain/src/import/importPrototype.ts')
      .filter(f => /\bgaw\b|ai-brain|guided agent|GAW_HOME/i.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
