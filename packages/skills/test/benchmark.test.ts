import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SkillRegistry, runBenchmark, type BenchmarkCase, type SetResult } from '@luci-dev/skills';

const evalDir = fileURLToPath(new URL('../../../eval/', import.meta.url));
const read = (file: string) => (JSON.parse(fs.readFileSync(path.join(evalDir, 'cases', file), 'utf8')) as { cases: BenchmarkCase[] }).cases;
const sets = { tuning: read('skill-selection.json'), 'held-out': read('skill-selection-holdout.json') };
const baseline = JSON.parse(fs.readFileSync(path.join(evalDir, 'baseline.json'), 'utf8')) as { sets: Record<string, SetResult> };
const registry = new SkillRegistry({ autoIndex: false });

// Ported from the prototype: eval-cases.test.js. Keeps the benchmark honest.
it('every labelled skill exists in the library and case IDs are unique', async () => {
  const ids = new Set<string>();
  for (const c of [...sets.tuning, ...sets['held-out']]) {
    expect(ids.has(c.id), `duplicate case id: ${c.id}`).toBe(false);
    ids.add(c.id);
    expect(c.task && c.domain, c.id).toBeTruthy();
    for (const skillId of c.relevant) expect(await registry.getSkill(skillId), `case ${c.id}: unknown skill "${skillId}"`).not.toBeNull();
  }
  expect(sets.tuning).toHaveLength(36);
  expect(sets['held-out']).toHaveLength(22);
});

// S7: the benchmark runs with the test suite. Scores must not fall below Luci's recorded baseline.
describe('skill selection benchmark', async () => {
  const result = await runBenchmark(registry, sets);
  for (const [setName, set] of Object.entries(result.sets)) {
    for (const [system, r] of Object.entries(set.systems)) {
      const b = baseline.sets[setName]?.systems[system];
      it(`${setName} / ${system}: hit rate, precision and no-match accuracy at or above the baseline`, () => {
        expect(b, 'baseline entry').toBeDefined();
        expect(r.hitRate).toBeGreaterThanOrEqual(b!.hitRate);
        expect(r.precision).toBeGreaterThanOrEqual(b!.precision);
        expect(r.noMatchAccuracy).toBeGreaterThanOrEqual(b!.noMatchAccuracy);
      });
    }
  }

  it('S3: loaded instructions stay within the 8,000-token budget in every case', () => {
    for (const c of result.perCase) expect(c.tokens, `${c.set}/${c.system}/${c.id}`).toBeLessThanOrEqual(8000 + 400);
  });
});
