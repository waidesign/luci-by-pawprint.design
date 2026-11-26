#!/usr/bin/env node
/**
 * Skill selection benchmark on Luci's own library (S7).
 *
 *   node scripts/eval.mjs                  # run and compare with eval/baseline.json
 *   node scripts/eval.mjs --verbose        # also show every case
 *   node scripts/eval.mjs --save-baseline  # store this run as the baseline
 *
 * Requires a build first (pnpm build). The test suite runs the same check
 * (packages/skills/test/benchmark.test.ts) and fails when a score drops.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillRegistry, runBenchmark } from '../packages/skills/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baselineFile = path.join(root, 'eval', 'baseline.json');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'eval', 'cases', f), 'utf8')).cases;
const sets = { tuning: read('skill-selection.json'), 'held-out': read('skill-selection-holdout.json') };

const registry = new SkillRegistry({ autoIndex: false });
const skills = await registry.getAllSkills();
const result = await runBenchmark(registry, sets);
const report = {
  generatedAt: new Date().toISOString(),
  sets: result.sets,
  library: { skills: skills.length, largestSkillTokens: Math.max(...skills.map(s => s.tokenEstimate ?? 0)) }
};
const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : null;

const pct = (n) => `${Math.round(n * 100)}%`;
console.log(`\nLuci skill selection benchmark (${skills.length} skills)`);
for (const [setName, set] of Object.entries(report.sets)) {
  console.log(`\n${setName}: ${set.cases} cases (${set.coveredCases} in scope, ${set.noMatchCases} should get no skills)`);
  for (const [name, r] of Object.entries(set.systems)) {
    const b = baseline?.sets?.[setName]?.systems?.[name];
    const d = (key) => (b && b[key] !== r[key] ? ` (baseline ${b[key]})` : '');
    console.log(`  ${name.padEnd(10)} hit ${pct(r.hitRate)}${d('hitRate')} · precision ${pct(r.precision)}${d('precision')} · no-match ${pct(r.noMatchAccuracy)}${d('noMatchAccuracy')} · ${r.avgSkills} skills · ${r.avgTokens} tokens`);
  }
}
if (args.includes('--verbose')) {
  console.log('\nper case');
  for (const c of result.perCase) {
    const ok = c.expectNone ? c.picked.length === 0 : c.relevantPicked.length > 0;
    console.log(`  ${ok ? 'ok  ' : 'MISS'} [${c.set}/${c.system}] ${c.id.padEnd(24)} ${c.picked.join(', ') || '(none)'}`);
  }
}
if (args.includes('--save-baseline')) {
  fs.writeFileSync(baselineFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nSaved ${path.relative(root, baselineFile)}`);
}
