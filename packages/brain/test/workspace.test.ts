import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectProjectRuleConflicts,
  diagnose,
  findProjectRoot,
  initProject,
  loadProjectContext,
  readAllPackageRules,
  readPackageRules
} from '@luci/brain';
import { tempDir, tempProject } from './helpers.js';

const monorepo = (rulesMd?: string) => tempProject({
  'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
  'package.json': JSON.stringify({ name: 'monorepo-root', private: true }),
  'packages/cli/package.json': JSON.stringify({ name: '@scope/cli', bin: { cli: 'bin.js' } }),
  'packages/brain/package.json': JSON.stringify({ name: '@scope/brain', main: 'index.js' }),
  '.luci/rules.md': rulesMd ?? [
    '# Project Rules',
    '',
    '## Safety',
    '- Never commit secrets',
    '',
    '## Project-Specific Rules',
    '- Root rule 1',
    '',
    '## Package: packages/cli',
    '- CLI must use commander',
    '- CLI must exit 0 on help',
    '',
    '## Package Rules: @scope/brain',
    '- Brain must be pure Node'
  ].join('\n')
});

describe('findProjectRoot (B16)', () => {
  it('finds root at the root directory with subPath empty and isInside false', () => {
    const root = monorepo();
    const result = findProjectRoot(root);
    expect(result.root).toBe(path.resolve(root));
    expect(result.subPath).toBe('');
    expect(result.isInside).toBe(false);
  });

  it('finds root from a direct sub-package with correct subPath and isInside true', () => {
    const root = monorepo();
    const sub = path.join(root, 'packages', 'cli');
    const result = findProjectRoot(sub);
    expect(result.root).toBe(path.resolve(root));
    expect(result.subPath).toBe('packages/cli');
    expect(result.isInside).toBe(true);
  });

  it('finds root from a deeply nested folder inside a package', () => {
    const root = monorepo();
    const deep = path.join(root, 'packages', 'cli', 'src', 'commands');
    fs.mkdirSync(deep, { recursive: true });
    const result = findProjectRoot(deep);
    expect(result.root).toBe(path.resolve(root));
    expect(result.subPath).toBe('packages/cli/src/commands');
    expect(result.isInside).toBe(true);
  });

  it('returns the given directory if no .luci folder exists in ancestors', () => {
    const empty = tempDir('empty-');
    const sub = path.join(empty, 'nested', 'sub');
    fs.mkdirSync(sub, { recursive: true });
    const result = findProjectRoot(sub);
    expect(result.root).toBe(path.resolve(sub));
    expect(result.subPath).toBe('');
    expect(result.isInside).toBe(false);
  });
});

describe('package rules parsing (B16)', () => {
  it('reads all package rules from rules.md by package heading', () => {
    const root = monorepo();
    const all = readAllPackageRules(root);
    expect(all).toEqual({
      'packages/cli': ['CLI must use commander', 'CLI must exit 0 on help'],
      '@scope/brain': ['Brain must be pure Node']
    });
  });

  it('matches package rules by path, full scoped name, or unscoped name', () => {
    const root = monorepo();
    const cliRules = readPackageRules(root, { path: 'packages/cli', name: '@scope/cli' });
    expect(cliRules).toEqual(['CLI must use commander', 'CLI must exit 0 on help']);

    const brainRules = readPackageRules(root, { path: 'packages/brain', name: '@scope/brain' });
    expect(brainRules).toEqual(['Brain must be pure Node']);

    // Matches unscoped name if heading was "## Package: brain"
    const root2 = monorepo([
      '# Project Rules',
      '## Package: brain',
      '- Unscoped rule'
    ].join('\n'));
    expect(readPackageRules(root2, { path: 'packages/brain', name: '@scope/brain' })).toEqual(['Unscoped rule']);
  });
});

describe('loadProjectContext inside a sub-package (B16)', () => {
  it('detects activePackage with its stack and package-specific rules', async () => {
    const root = monorepo();
    await initProject(root);
    // Overwrite rules.md with package rules
    fs.writeFileSync(path.join(root, '.luci', 'rules.md'), [
      '# Project Rules',
      '## Project-Specific Rules',
      '- Monorepo root rule',
      '## Package: packages/cli',
      '- CLI must use commander',
      '## Package Rules: @scope/brain',
      '- Brain must be pure Node'
    ].join('\n'), 'utf8');

    const cliDir = path.join(root, 'packages', 'cli');
    const ctx = await loadProjectContext(cliDir);

    expect(ctx.initialized).toBe(true);
    expect(ctx.rules).toEqual(['Monorepo root rule']);
    expect(ctx.project.activePackage).toBeDefined();
    expect(ctx.project.activePackage?.path).toBe('packages/cli');
    expect(ctx.project.activePackage?.name).toBe('@scope/cli');
    expect(ctx.project.activePackage?.rules).toEqual(['CLI must use commander']);
    expect(ctx.project.packages?.length).toBe(2);
    expect(ctx.packageRules).toEqual({
      'packages/cli': ['CLI must use commander'],
      '@scope/brain': ['Brain must be pure Node']
    });
  });

  it('at monorepo root, activePackage is undefined but all packages have their rules', async () => {
    const root = monorepo();
    await initProject(root);
    fs.writeFileSync(path.join(root, '.luci', 'rules.md'), [
      '# Project Rules',
      '## Project-Specific Rules',
      '- Monorepo root rule',
      '## Package: packages/cli',
      '- CLI must use commander'
    ].join('\n'), 'utf8');

    const ctx = await loadProjectContext(root);
    expect(ctx.project.activePackage).toBeUndefined();
    expect(ctx.project.packages?.find(p => p.path === 'packages/cli')?.rules).toEqual(['CLI must use commander']);
  });
});

describe('diagnose inside a sub-package (B16)', () => {
  it('reports activePackage and package rules count in diagnosis', async () => {
    const root = monorepo();
    await initProject(root);
    fs.writeFileSync(path.join(root, '.luci', 'rules.md'), [
      '# Project Rules',
      '## Project-Specific Rules',
      '- Root rule',
      '## Package: packages/cli',
      '- Rule 1',
      '- Rule 2'
    ].join('\n'), 'utf8');

    const cliDir = path.join(root, 'packages', 'cli');
    const result = await diagnose(cliDir);
    expect(result.ok).toBe(true);
    expect(result.project?.activePackage?.path).toBe('packages/cli');
    expect(result.project?.packageRules).toBe(2);
  });
});

describe('rule conflicts across packages (B16)', () => {
  it('does not flag contradicting rules between different packages as conflicts', () => {
    const root = monorepo([
      '# Project Rules',
      '## Package: packages/cli',
      '- Use CommonJS modules exclusively.',
      '## Package: packages/brain',
      '- Use ES modules (import/export) everywhere.'
    ].join('\n'));

    const conflicts = detectProjectRuleConflicts(root);
    expect(conflicts).toEqual([]);
  });
});
