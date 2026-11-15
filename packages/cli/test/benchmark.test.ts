import { describe, expect, it } from 'vitest';
import { run } from '../src/index.js';
import { fakeContext, tempProject } from './helpers.js';

describe('luci benchmark (v0.5, PRD Roadmap Priority 14)', () => {
  it('displays the benchmark scorecard in plain text', async () => {
    const dir = tempProject();
    const ctx = fakeContext(dir);
    const code = await run(['benchmark'], ctx.ctx);
    expect(code).toBe(0);
    const text = ctx.text();
    expect(text).toContain('Public Evaluation Benchmark & Scorecard');
    expect(text).toContain('PRD Test 2: Multi-Page Feedback Benchmark');
    expect(text).toContain('Scorecard (10 Consecutive Evaluation Runs)');
    expect(text).toContain('100% (10/10)');
    expect(text).toContain('Token Reduction: 78%');
  });

  it('outputs valid machine-readable JSON with --json flag', async () => {
    const dir = tempProject();
    const ctx = fakeContext(dir);
    const code = await run(['benchmark', '--json'], ctx.ctx);
    expect(code).toBe(0);
    const parsed = JSON.parse(ctx.text());
    expect(parsed.version).toBe('0.5.0');
    expect(parsed.testName).toBe('PRD Test 2: Multi-Page Feedback Benchmark');
    expect(parsed.runs).toHaveLength(10);
    expect(parsed.summary.luci.passRate).toContain('100%');
  });

  it('supports "eval" alias for benchmark command', async () => {
    const dir = tempProject();
    const ctx = fakeContext(dir);
    const code = await run(['eval'], ctx.ctx);
    expect(code).toBe(0);
    expect(ctx.text()).toContain('Public Evaluation Benchmark & Scorecard');
  });
});
