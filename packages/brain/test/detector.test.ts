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
