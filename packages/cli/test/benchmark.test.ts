import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

describe('luci benchmark', () => {
  it('reports when no saved evaluation reports exist without inventing numbers or competitor claims', async () => {
    const dir = tempProject();
    const ctx = fakeContext(dir);
    const code = await run(['benchmark'], ctx.ctx);
    expect(code).toBe(0);
    const text = ctx.text();
    expect(text).toContain('No saved evaluation reports found in eval/.');
    expect(text).not.toContain('Agentation');
    expect(text).not.toContain('78%');
  });

  it('outputs valid machine-readable JSON with --json when no saved reports exist', async () => {
    const dir = tempProject();
    const ctx = fakeContext(dir);
    const code = await run(['benchmark', '--json'], ctx.ctx);
    expect(code).toBe(0);
    const parsed = JSON.parse(ctx.text());
    expect(parsed.cwd).toBe(dir);
    expect(parsed.baseline).toBeNull();
    expect(parsed.multiPage).toBeNull();
  });

  it('reads and displays saved eval/baseline.json and eval/multi-page-report.json when present', async () => {
    const dir = tempProject();
    const evalDir = path.join(dir, 'eval');
    fs.mkdirSync(evalDir, { recursive: true });
    fs.writeFileSync(
      path.join(evalDir, 'baseline.json'),
      JSON.stringify({
        generatedAt: '2026-11-16T00:00:00.000Z',
        library: { skills: 38 },
        sets: {
          tuning: {
            cases: 36,
            systems: {
              use: { hitRate: 1, precision: 0.923, noMatchAccuracy: 0.864, avgTokens: 1182 }
            }
          }
        }
      })
    );
    fs.writeFileSync(
      path.join(evalDir, 'multi-page-report.json'),
      JSON.stringify({
        date: '2026-11-16T12:00:00.000Z',
        format: 'Luci',
        totalRuns: 2,
        passedRuns: 2,
        passRate: 100,
        scoreSheet: [
          { run: 1, applied: 6, reported: 6, pass: true, note: 'All items complete' },
          { run: 2, applied: 6, reported: 6, pass: true, note: 'All items complete' }
        ]
      })
    );

    const textCtx = fakeContext(dir);
    expect(await run(['benchmark'], textCtx.ctx)).toBe(0);
    const text = textCtx.text();
    expect(text).toContain('Skill selection baseline (eval/baseline.json)');
    expect(text).toContain('38 skills');
    expect(text).toContain('Multi-page evaluation report (eval/multi-page-report.json)');
    expect(text).toContain('2/2 passed (100%)');

    const jsonCtx = fakeContext(dir);
    expect(await run(['benchmark', '--json'], jsonCtx.ctx)).toBe(0);
    const parsed = JSON.parse(jsonCtx.text());
    expect(parsed.baseline.library.skills).toBe(38);
    expect(parsed.multiPage.passedRuns).toBe(2);
  });

  it('supports "eval" alias and rejects unknown options', async () => {
    const dir = tempProject();
    const aliasCtx = fakeContext(dir);
    expect(await run(['eval'], aliasCtx.ctx)).toBe(0);
    expect(aliasCtx.text()).toContain('evaluation reports');

    const errCtx = fakeContext(dir);
    expect(await run(['benchmark', '--bogus'], errCtx.ctx)).toBe(1);
    expect(errCtx.errors()).toContain('Unknown option for benchmark');
  });
});
