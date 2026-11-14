import { describe, expect, it } from 'vitest';
import { detectProject } from '@luci/brain';
import { pkg, tempProject } from './helpers.js';

const deps = (dependencies: Record<string, string>) => pkg({ dependencies });

// Ported from the prototype: project-detector.test.js
describe('detector', () => {
  it('JavaScript projects without UI signals are not called frontend', () => {
    expect(detectProject(tempProject({ 'package.json': pkg() })).framework).toBe('node');
    expect(detectProject(tempProject({ 'package.json': deps({ express: '^4' }) })).framework).toBe('express');
    expect(detectProject(tempProject({ 'package.json': deps({ '@nestjs/core': '^10' }) })).framework).toBe('nestjs');
  });

  it('frontend and UI frameworks are still recognized', () => {
    expect(detectProject(tempProject({ 'package.json': pkg(), 'index.html': '<html></html>' })).framework).toBe('plain-frontend');
    expect(detectProject(tempProject({ 'package.json': deps({ react: '^18', vite: '^5' }) })).framework).toBe('react-vite');
    expect(detectProject(tempProject({ 'package.json': deps({ next: '^14' }) })).framework).toBe('nextjs');
  });

  it('a monorepo: each package with its kind and stack; the whole project from all of them', () => {
    const dir = tempProject({
      'package.json': pkg({ private: true, devDependencies: { vitest: '5' } }),
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - apps/web # the site\n  - '!packages/old'\nallowBuilds:\n  esbuild: false\n",
      'packages/cli/package.json': pkg({ name: 'tool', bin: { tool: 'dist/bin.js' } }),
      'packages/mcp/package.json': pkg({ name: '@x/mcp', bin: 'dist/bin.js', dependencies: { '@modelcontextprotocol/sdk': '1' } }),
      'packages/ui/package.json': pkg({ name: '@x/ui', dependencies: { preact: '10', tailwindcss: '4' } }),
      'packages/ext/package.json': pkg({ name: '@x/ext', devDependencies: { wxt: '0.20' } }),
      'packages/old/package.json': pkg({ name: '@x/old' }),
      'packages/notes/readme.md': '',
      'apps/web/package.json': pkg({ name: 'web', dependencies: { next: '15', react: '19' }, devDependencies: { '@playwright/test': '1' } })
    });
    const info = detectProject(dir);
    expect(info.framework).toBe('monorepo');
    expect(info.packages).toEqual([
      { name: 'web', path: 'apps/web', kind: 'app', framework: 'nextjs' },
      { name: 'tool', path: 'packages/cli', kind: 'cli', framework: 'node' },
      { name: '@x/ext', path: 'packages/ext', kind: 'browser-extension', framework: 'browser-extension' },
      { name: '@x/mcp', path: 'packages/mcp', kind: 'mcp-server', framework: 'node' },
      { name: '@x/ui', path: 'packages/ui', kind: 'library', framework: 'preact' }
    ]);
    // Signals of all packages together: the site's React and UI, the UI library's Tailwind, every test runner
    expect(info.hasUi).toBe(true);
    expect(info.isReact).toBe(true);
    expect(info.uiLibraries).toEqual(['tailwindcss']);
    expect(info.testingFrameworks).toEqual(['vitest', 'playwright']);
    expect(info.dependencies).toEqual(expect.arrayContaining(['vitest', 'preact', 'next', 'wxt']));
    // npm and yarn workspaces in package.json; a root that is an app keeps its framework
    const npm = tempProject({
      'package.json': pkg({ workspaces: { packages: ['libs/*'] }, dependencies: { next: '15' } }),
      'next.config.js': '',
      'libs/a/package.json': pkg({ name: 'a' })
    });
    expect(detectProject(npm)).toMatchObject({ framework: 'nextjs', packages: [{ path: 'libs/a', kind: 'library' }] });
    // One project: no packages
    expect(detectProject(tempProject({ 'package.json': pkg() })).packages).toEqual([]);
  });

  it('a framework only in devDependencies counts when the project\'s own files show it', () => {
    const dev = (devDependencies: Record<string, string>) => pkg({ devDependencies });
    // A tool that installs React only to test against it (Luci's own repository) is not a React app
    const tool = detectProject(tempProject({ 'package.json': dev({ react: '19.3.1', 'react-dom': '19.3.1', vitest: '5' }), 'packages/cli/src/index.ts': '' }));
    expect(tool.framework).toBe('node');
    expect(tool.isReact).toBe(false);
    expect(tool.dependencies).toContain('react');
    // With its own .tsx sources it is
    expect(detectProject(tempProject({ 'package.json': dev({ react: '18' }), 'src/App.tsx': '' })).framework).toBe('react');
    // A component library: react as a peer dependency
    expect(detectProject(tempProject({ 'package.json': pkg({ peerDependencies: { react: '>=18' }, devDependencies: { react: '18' } }) })).framework).toBe('react');
    // SvelteKit lists svelte in devDependencies; its .svelte files show it
    expect(detectProject(tempProject({ 'package.json': dev({ '@sveltejs/kit': '2', svelte: '5', vite: '6' }), 'src/routes/+page.svelte': '' })).framework).toBe('svelte');
    expect(detectProject(tempProject({ 'package.json': dev({ svelte: '5' }), 'svelte.config.js': '' })).framework).toBe('svelte');
  });

  it('languages come from the project files, not assumed', () => {
    const py = detectProject(tempProject({ 'requirements.txt': 'fastapi==0.110\nuvicorn' }));
    expect(py.languages).toEqual(['Python']);
    expect(py.framework).toBe('fastapi');
    expect(detectProject(tempProject({ 'go.mod': 'module demo' })).languages).toEqual(['Go']);
    expect(detectProject(tempProject({ 'tsconfig.json': '{}', 'package.json': pkg() })).languages).toEqual(['TypeScript']);
    const empty = detectProject(tempProject({ 'notes.md': '# Notes' }));
    expect(empty.languages).toEqual([]);
    expect(empty.framework).toBe('unknown');
  });

  // Ported from the prototype: brain-layout.test.js
  it('npm placeholder test script is not a test command; pnpm runs scripts directly', () => {
    const dir = tempProject({
      'package.json': pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .' } }),
      'pnpm-lock.yaml': ''
    });
    const info = detectProject(dir);
    expect(info.commands.test).toBeNull();
    expect(info.commands.lint).toBe('pnpm lint');
    expect(info.lockfiles).toEqual(['pnpm-lock.yaml']);
  });

  // Ported from the prototype: e2e-init.test.js
  it('a .tsx file means TypeScript even without tsconfig.json', () => {
    const dir = tempProject({ 'package.json': deps({ react: '^18' }), 'src/App.tsx': 'export default () => null;' });
    expect(detectProject(dir).languages).toEqual(['TypeScript']);
  });

  it('reads package.json saved with a byte-order mark', () => {
    expect(detectProject(tempProject({ 'package.json': `﻿${deps({ next: '^14' })}` })).framework).toBe('nextjs');
  });

  it('finds Luci memory, the code map and existing agent files', () => {
    const dir = tempProject({ '.luci/brain.json': '{}', 'graphify-out/graph.json': '{}', 'CLAUDE.md': '', '.cursorrules': '' });
    const info = detectProject(dir);
    expect(info.hasProjectBrain).toBe(true);
    expect(info.hasGraphify).toBe(true);
    expect(info.aiConfigs).toEqual(['claude-code', 'cursor']);
  });

  it('never writes into the project', () => {
    const dir = tempProject({ 'package.json': pkg() });
    detectProject(dir);
    expect(detectProject(dir).hasProjectBrain).toBe(false);
  });
});
