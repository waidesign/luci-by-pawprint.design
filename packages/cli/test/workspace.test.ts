import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject, writeActiveTask } from '@luci-dev/brain';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

const monorepo = async () => {
  const root = tempProject({
    'pnpm-workspace.yaml': 'packages:\n  - "packages/*"\n',
    'package.json': JSON.stringify({ name: 'monorepo-root', private: true }),
    'packages/cli/package.json': JSON.stringify({ name: '@scope/cli', bin: { cli: 'bin.js' } }),
    'packages/brain/package.json': JSON.stringify({ name: '@scope/brain', main: 'index.js' })
  });
  await initProject(root);
  fs.writeFileSync(path.join(root, '.luci', 'rules.md'), [
    '# Project Rules',
    '## Project-Specific Rules',
    '- Monorepo root rule',
    '## Package: packages/cli',
    '- CLI must use commander',
    '- CLI must exit 0 on help',
    '## Package Rules: @scope/brain',
    '- Brain must be pure Node'
  ].join('\n'), 'utf8');
  return root;
};

describe('luci start in a workspace (B16)', () => {
  it('running inside a package shows the active package and its rules', async () => {
    const root = await monorepo();
    const cliDir = path.join(root, 'packages', 'cli');
    const f = fakeContext(cliDir);

    const code = await run(['start'], f.ctx);
    expect(code).toBe(0);

    const out = f.text();
    expect(out).toContain(`Luci start: ${root} (package: packages/cli)`);
    expect(out).toContain('Package:      packages/cli (@scope/cli) — cli, node');
    expect(out).toContain('Package rules (2):');
    expect(out).toContain('  - CLI must use commander');
    expect(out).toContain('  - CLI must exit 0 on help');
    expect(out).toContain('Own rules:    1');
  });

  it('running at monorepo root lists all packages with their stack and rule counts', async () => {
    const root = await monorepo();
    const f = fakeContext(root);

    const code = await run(['start'], f.ctx);
    expect(code).toBe(0);

    const out = f.text();
    expect(out).toContain(`Luci start: ${root}`);
    expect(out).not.toContain('(package:');
    expect(out).toContain('Packages (2):');
    expect(out).toContain('  - packages/cli (@scope/cli) — cli, node (2 rules)');
    expect(out).toContain('  - packages/brain (@scope/brain) — library, node (1 rule)');
  });
});

describe('luci doctor in a workspace (B16)', () => {
  it('running inside a package shows that package and its rules count', async () => {
    const root = await monorepo();
    const cliDir = path.join(root, 'packages', 'cli');
    const f = fakeContext(cliDir);

    const code = await run(['doctor'], f.ctx);
    expect(code).toBe(0);

    const out = f.text();
    expect(out).toContain('Package:      packages/cli (@scope/cli) — cli, node');
    expect(out).toContain('Package rules:2');
  });
});

describe('luci task in a workspace (B16)', () => {
  it('reads and archives the active task from inside a sub-package', async () => {
    const root = await monorepo();
    writeActiveTask(root, '# Active Task\n\n- **Task**: Package task\n- **Status**: active\n- **Started**: 2026-11-15\n');

    const cliDir = path.join(root, 'packages', 'cli');
    const f1 = fakeContext(cliDir);
    expect(await run(['task'], f1.ctx)).toBe(0);
    expect(f1.text()).toContain('Task:    Package task');

    const f2 = fakeContext(cliDir);
    expect(await run(['task', 'done'], f2.ctx)).toBe(0);
    expect(f2.text()).toContain('Task archived to .luci/local/archive/');
  });
});
