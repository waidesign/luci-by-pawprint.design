import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProposal } from '@luci-dev/format';
import { analyzeDoc, initProject, intakeDocs, kindOf, splitSections } from '@luci-dev/brain';
import { run } from '../src/index.js';
import { fakeContext, readMemory, tempProject } from './helpers.js';

const PRD = `# Recipe Box PRD

## 1. Summary
Recipe Box lets home cooks save, scale and share recipes. It is for people who cook
for a family and plan meals for the week.

## Problem
Home cooks never find the recipe they saved last month.

## Goals
- Save a recipe from any page in two clicks

## Non-goals
- Meal delivery
- A social feed

## Requirements
- Every price must be shown in euros.
- The app never stores card numbers.
- Users can print a recipe.

\`\`\`js
// must not be read as a rule: code
\`\`\`

## Architecture
A React front end talks to a small Node API; recipes live in SQLite.

## Tech stack
| Layer | Choice |
| --- | --- |
| UI | React 18 |
| API | Fastify |

## Acceptance criteria
- A saved recipe opens offline
- Lighthouse accessibility score of 95 or more

## Decisions
- Use SQLite, not Postgres: one file is enough for v1
`;

const project = async (files: Record<string, string> = {}) => {
  const dir = tempProject({ 'package.json': JSON.stringify({ name: 'recipes' }), 'docs/PRD.md': PRD, ...files });
  await initProject(dir);
  return dir;
};
const proposals = (dir: string) => {
  const folder = path.join(dir, '.luci', 'memory', 'proposed');
  return fs.readdirSync(folder).filter(f => f !== 'README.md').map(f => fs.readFileSync(path.join(folder, f), 'utf8'));
};

describe('PRD intake: reading a doc (B10)', () => {
  it('sorts sections by heading, and "Non-goals" is not a goal', () => {
    expect(kindOf('1. Summary')).toBe('goal');
    expect(kindOf('Non-goals')).toBe('nonGoals');
    expect(kindOf('Out of scope')).toBe('nonGoals');
    expect(kindOf('Acceptance criteria')).toBe('done');
    expect(kindOf('Tech stack')).toBe('stack');
    expect(kindOf('Pricing page')).toBeNull();
    expect(kindOf('Goals and non-goals')).toBe('goal');
    expect(kindOf('Decisions still to settle')).toBeNull();
    expect(kindOf('Technical approach')).toBe('architecture');
  });

  it('finds the goal, rules, non-goals, criteria, decisions and stack', () => {
    const doc = analyzeDoc(PRD, 'docs/PRD.md');
    expect(doc.title).toBe('Recipe Box PRD');
    expect(doc.goal?.text).toBe('Recipe Box lets home cooks save, scale and share recipes. It is for people who cook for a family and plan meals for the week.');
    expect(doc.goal?.from).toBe('Summary');
    expect(doc.rules.map(r => r.text)).toEqual(['Every price must be shown in euros.', 'The app never stores card numbers.']);
    expect(doc.nonGoals.map(r => r.text)).toEqual(['Meal delivery', 'A social feed']);
    expect(doc.done).toHaveLength(2);
    expect(doc.decisions[0]?.text).toContain('Use SQLite');
    expect(doc.stack.map(s => s.text)).toEqual(['UI: React 18', 'API: Fastify']);
    expect(doc.architecture?.text).toContain('small Node API');
  });

  it('a text file without headings is one section', () => {
    expect(splitSections('Just notes.\nYou must test.', 'notes')).toHaveLength(1);
    expect(analyzeDoc('Just notes. You must test every change.', 'notes.txt').rules).toHaveLength(1);
  });
});

describe('PRD intake: writing memory (B10)', () => {
  it('fills only empty context.md sections and proposes the rest', async () => {
    const dir = await project();
    const report = intakeDocs(dir, ['docs/PRD.md']);
    expect(report.filled.map(f => f.section)).toEqual(['context.md Project Goal', 'context.md Architecture Notes']);
    const context = readMemory(dir, 'context.md');
    expect(context).toContain('Recipe Box lets home cooks save');
    expect(context).toContain('_From docs/PRD.md ("Summary")');
    expect(report.proposals.map(p => p.belongsIn)).toEqual(['rules.md', 'rules.md', 'context.md', 'decisions/', 'context.md', 'context.md']);
    // Agents and people review proposals; rules.md is never edited by intake
    expect(readMemory(dir, 'rules.md')).not.toContain('euros');
    for (const text of proposals(dir)) expect(parseProposal(text).ok, text).toBe(true);
    expect(proposals(dir).join('\n')).toContain('Every price must be shown in euros. (from "Requirements")');
  });

  it('never replaces text a person wrote, and a second run proposes nothing new', async () => {
    const dir = await project();
    const file = path.join(dir, '.luci', 'context.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/_Not written yet: one or two sentences[^\n]*/, 'Our own goal.'), 'utf8');
    const first = intakeDocs(dir, ['docs/PRD.md']);
    expect(first.filled.map(f => f.section)).toEqual(['context.md Architecture Notes']);
    expect(readMemory(dir, 'context.md')).toContain('Our own goal.');
    expect(first.proposals.some(p => p.topic === 'Project Goal from Recipe Box PRD')).toBe(true);
    const count = proposals(dir).length;
    const second = intakeDocs(dir, ['docs/PRD.md']);
    expect(second.proposals).toEqual([]);
    expect(proposals(dir)).toHaveLength(count);
  });

  it('a dry run writes nothing; unreadable files are reported', async () => {
    const dir = await project({ 'docs/spec.pdf': '%PDF' });
    const before = readMemory(dir, 'context.md');
    const report = intakeDocs(dir, ['docs/PRD.md', 'docs/spec.pdf', 'missing.md'], { dryRun: true });
    expect(report.proposals.length).toBeGreaterThan(0);
    expect(readMemory(dir, 'context.md')).toBe(before);
    expect(proposals(dir)).toEqual([]);
    expect(report.errors).toHaveLength(2);
    expect(report.errors[0]).toContain('save it as Markdown first');
  });

  it('luci intake reports what went where; without .luci/ nothing is written', async () => {
    const dir = await project();
    const f = fakeContext(dir);
    expect(await run(['intake', 'docs/PRD.md'], f.ctx)).toBe(0);
    expect(f.text()).toContain('Filled (these sections were still empty):');
    expect(f.text()).toContain('Rules from Recipe Box PRD');
    expect(f.text()).toContain('Nothing you wrote was replaced');

    const bare = tempProject({ 'docs/PRD.md': PRD });
    const g = fakeContext(bare);
    expect(await run(['intake', 'docs/PRD.md'], g.ctx)).toBe(1);
    expect(g.errors()).toContain('luci init');
    expect(fs.existsSync(path.join(bare, '.luci'))).toBe(false);
    expect(await run(['intake'], fakeContext(dir).ctx)).toBe(1);
  });

  it('handles subdirectories, subdirectories in proposed/, and rejects unknown flags (B-77)', async () => {
    const dir = await project();

    // 1. Subdirectory in proposed does not throw EISDIR
    const subProposed = path.join(dir, '.luci', 'memory', 'proposed', 'nested-dir');
    fs.mkdirSync(subProposed, { recursive: true });
    expect(() => intakeDocs(dir, ['docs/PRD.md'])).not.toThrow();

    // 2. Running from a subdirectory resolves project root
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const fSub = fakeContext(srcDir);
    expect(await run(['intake', '../docs/PRD.md'], fSub.ctx)).toBe(0);

    // 3. Rejects unknown flags like -x or --bogus
    const fFlag = fakeContext(dir);
    expect(await run(['intake', '-x', 'docs/PRD.md'], fFlag.ctx)).toBe(1);
    expect(fFlag.errors()).toContain('Unknown option: -x');
  });
});
