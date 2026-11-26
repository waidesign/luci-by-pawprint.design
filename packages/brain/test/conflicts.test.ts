import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAIN_DIR,
  MemoryEngine,
  detectProjectRuleConflicts,
  diagnose,
  extractRulesFromMarkdown,
  findRuleConflicts,
  initProject,
  loadProjectContext
} from '@luci-dev/brain';
import { pkg, tempDir, tempProject } from './helpers.js';

describe('conflict detection (B12, v0.3.5)', () => {
  it('finds known mutually exclusive pairs across Global Brain and project rules.md', () => {
    const globalMd = [
      '# Coding Preferences',
      '',
      '- Indent with 2 spaces across all files.',
      '- Use single quotes for strings.',
      '- Always use semicolons at the end of statements.',
      '- Use pnpm as the package manager.',
      '- **5.2 Clean Named Exports**: Use named exports exclusively instead of default exports.',
      '- Use ES modules (import/export) everywhere.',
      '- Write function components only.'
    ].join('\n');

    const projectMd = [
      '# Project Rules',
      '',
      '## Project-Specific Rules',
      '- Use tabs for indentation.',
      '- Use double quotes for strings.',
      '- Omit semicolons in TypeScript files.',
      '- Use npm in this repository.',
      '- Use default exports for page and UI components.',
      '- Use CommonJS in scripts.',
      '- Use class components for legacy views.'
    ].join('\n');

    const globalRules = extractRulesFromMarkdown(globalMd, '~/.luci/brain/coding-preferences.md', 'global');
    const projectRules = extractRulesFromMarkdown(projectMd, '.luci/rules.md', 'project');
    const conflicts = findRuleConflicts(projectRules, globalRules);

    expect(conflicts.map(c => c.subject)).toEqual([
      'indentation',
      'quotes',
      'semicolons',
      'package manager',
      'exports',
      'modules',
      'components'
    ]);

    const exportsConflict = conflicts.find(c => c.subject === 'exports')!;
    expect(exportsConflict.project).toMatchObject({ file: '.luci/rules.md', line: 8 });
    expect(exportsConflict.other).toMatchObject({ file: '~/.luci/brain/coding-preferences.md', line: 7 });
    expect(exportsConflict.winner).toContain('.luci/rules.md wins over Global Brain (~/.luci/brain)');
    expect(exportsConflict.summary).toContain('.luci/rules.md:8');
    expect(exportsConflict.summary).toContain('~/.luci/brain/coding-preferences.md:7');
    expect(exportsConflict.summary).toContain('Precedence: .luci/rules.md wins over Global Brain (~/.luci/brain).');
  });

  it('finds opposite statements (always/never, use/don\'t use, must/must not) on the same subject', () => {
    const globalMd = [
      '# Global Preferences',
      '',
      '- Never use barrel files.',
      '- **1.3 Icon Discipline**: No emojis in product UI.',
      '- Components must never set outer margins.',
      '- Always use Tailwind CSS for styling.',
      '- API handlers must validate request bodies.'
    ].join('\n');

    const projectMd = [
      '# Project Rules',
      '',
      '## Project-Specific Rules',
      '- Always use barrel files in packages.',
      '- Allow emojis in product UI.',
      '- Components must set outer margins.',
      '- Do not use Tailwind CSS for styling.',
      '- API handlers must not validate request bodies.'
    ].join('\n');

    const globalRules = extractRulesFromMarkdown(globalMd, '~/.luci/brain/preferences.md', 'global');
    const projectRules = extractRulesFromMarkdown(projectMd, '.luci/rules.md', 'project');
    const conflicts = findRuleConflicts(projectRules, globalRules);

    expect(conflicts).toHaveLength(5);
    expect(conflicts[0]?.subject).toBe('barrel file');
    expect(conflicts[1]?.subject).toBe('emoji product ui');
    expect(conflicts[2]?.subject).toBe('component outer margin');
    expect(conflicts[3]?.subject).toBe('tailwind css styling');
    expect(conflicts[4]?.subject).toBe('api handler validate request body');
  });

  it('skips code blocks, checkboxes, conditional exceptions and unrelated rules sharing only a verb', () => {
    const globalMd = [
      '# Design & Coding',
      '',
      '```tsx',
      '- Use default exports in this code comment',
      '```',
      '- [ ] **1. Audit**: Use default exports?',
      '- **1.3 Icon Discipline**: No emojis in product UI. Icons are permitted only when they carry semantic meaning.',
      '- Never hardcode design values.'
    ].join('\n');

    const projectMd = [
      '# Project Rules',
      '',
      '## Safety',
      '- Never commit, print or paste secrets.',
      '',
      '## Project-Specific Rules',
      '- Commit locally after each finished task; never push.',
      '- UI changes reuse the design values already in the code.'
    ].join('\n');

    const globalRules = extractRulesFromMarkdown(globalMd, '~/.luci/brain/design-principles.md', 'global');
    const projectRules = extractRulesFromMarkdown(projectMd, '.luci/rules.md', 'project');
    expect(findRuleConflicts(projectRules, globalRules)).toEqual([]);
  });

  it('has zero conflicts on a freshly initialized project with the default Global Brain', async () => {
    const globalBrain = tempDir('luci-gb-defaults-');
    new MemoryEngine({ globalBrainDir: globalBrain, defaultsDir: DEFAULT_BRAIN_DIR }).initGlobalBrain();
    const project = tempProject({ 'package.json': pkg() });
    await initProject(project, { globalBrainDir: globalBrain });

    expect(detectProjectRuleConflicts(project, globalBrain)).toEqual([]);
  });

  it('surfaces conflicts in luci doctor (diagnose) and get_project_context with both files, lines and precedence', async () => {
    const globalBrain = tempDir('luci-gb-conflict-');
    fs.writeFileSync(
      path.join(globalBrain, 'coding-preferences.md'),
      '# Coding Preferences\n\n- Use named exports exclusively instead of default exports.\n- Never use barrel files.\n',
      'utf8'
    );

    const project = tempProject({ 'package.json': pkg() });
    await initProject(project, { globalBrainDir: globalBrain });

    const rulesPath = path.join(project, '.luci', 'rules.md');
    fs.appendFileSync(
      rulesPath,
      '- Use default exports for route pages.\n- Always use barrel files in packages.\n',
      'utf8'
    );

    const diagnosis = await diagnose(project, { globalBrainDir: globalBrain });
    const conflictChecks = diagnosis.checks.filter(c => c.label === 'Rule conflict');
    expect(conflictChecks).toHaveLength(2);
    expect(conflictChecks[0]).toMatchObject({
      area: 'project',
      status: 'warn',
      label: 'Rule conflict',
      detail: expect.stringContaining('.luci/rules.md:'),
      fix: expect.stringContaining('.luci/rules.md')
    });
    expect(conflictChecks[0]?.detail).toContain('~/.luci/brain/coding-preferences.md:3');
    expect(conflictChecks[0]?.detail).toContain('Precedence: .luci/rules.md wins over Global Brain (~/.luci/brain).');

    const ctx = await loadProjectContext(project, { globalBrainDir: globalBrain });
    const conflictWarnings = ctx.warnings.filter(w => w.startsWith('Rule conflict:'));
    expect(conflictWarnings).toHaveLength(2);
    expect(conflictWarnings[0]).toContain('.luci/rules.md:');
    expect(conflictWarnings[0]).toContain('~/.luci/brain/coding-preferences.md:3');
    expect(conflictWarnings[1]).toContain('~/.luci/brain/coding-preferences.md:4');
  });

  it('flags contradictions inside .luci/rules.md itself and notes when Safety rules win', () => {
    const projectMd = [
      '# Project Rules',
      '',
      '## Safety',
      '- Never commit secrets to the repository.',
      '',
      '## Project-Specific Rules',
      '- Always commit secrets to the repository.',
      '- Use single quotes for strings.',
      '- Use double quotes for strings.'
    ].join('\n');

    const rules = extractRulesFromMarkdown(projectMd, '.luci/rules.md', 'project');
    const conflicts = findRuleConflicts(rules);
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]?.winner).toContain('Safety rules in .luci/rules.md win over other sections in .luci/rules.md');
    expect(conflicts[1]?.subject).toBe('quotes');
    expect(conflicts[1]?.winner).toContain('both rules are in .luci/rules.md at the same precedence level');
  });
});
