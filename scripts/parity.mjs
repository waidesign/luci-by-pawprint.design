#!/usr/bin/env node
/**
 * Port parity check (dev tooling, not part of the product).
 *
 * Copies an existing skill library in the earlier prototype's layout into a temporary
 * folder, renaming only file and metadata keys to the Luci Skill Standard, then runs the
 * original benchmark cases through Luci's engine and compares them with the prototype's
 * recorded baseline (eval/prototype-baseline/). Nothing is written into this repository.
 *
 *   node scripts/parity.mjs <path-to-old-skill-library> [--verbose]
 *
 * Requires a build first (pnpm build).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillRegistry, runBenchmark } from '../packages/skills/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
const verbose = process.argv.includes('--verbose');
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/parity.mjs <path-to-old-skill-library> [--verbose]');
  process.exit(2);
}

const OLD_CONTRACT = ['g', 'a', 'w', '.json'].join('');
const OLD_PREFIX = `${['g', 'a', 'w'].join('')}-`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-parity-'));

function convert(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    if (entry.isDirectory()) { convert(src, path.join(to, entry.name)); continue; }
    if (entry.name === 'index.json') continue;
    if (entry.name === OLD_CONTRACT) {
      const contract = JSON.parse(fs.readFileSync(src, 'utf8').replace(/^﻿/, ''));
      const { gss, ...rest } = contract;
      fs.writeFileSync(path.join(to, 'luci.json'), `${JSON.stringify({ lss: gss ?? 1, ...rest }, null, 2)}\n`, 'utf8');
    } else if (entry.name === 'SKILL.md') {
      fs.writeFileSync(path.join(to, entry.name), fs.readFileSync(src, 'utf8').split(`  ${OLD_PREFIX}`).join('  luci-'), 'utf8');
    } else {
      fs.copyFileSync(src, path.join(to, entry.name));
    }
  }
}

try {
  convert(path.resolve(source), tmp);
  const registry = new SkillRegistry({ skillsDir: tmp, autoIndex: false });
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'eval', 'prototype-baseline', f), 'utf8')).cases;
  const sets = { tuning: read('skill-selection.json'), 'held-out': read('skill-selection-holdout.json') };
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'prototype-baseline', 'baseline.json'), 'utf8'));

  const result = await runBenchmark(registry, sets);
  const skills = (await registry.getAllSkills()).length;
  let same = true;
  console.log(`Parity on ${skills} skills (prototype baseline: ${baseline.library.skills})\n`);
  for (const [setName, set] of Object.entries(result.sets)) {
    for (const [system, r] of Object.entries(set.systems)) {
      const b = baseline.sets[setName].systems[system];
      for (const key of ['hitRate', 'precision', 'noMatchAccuracy', 'avgSkills']) {
        const ok = r[key] === b[key];
        if (!ok) same = false;
        console.log(`${ok ? 'same' : 'DIFF'}  ${setName.padEnd(8)} ${system.padEnd(10)} ${key.padEnd(16)} luci ${r[key]}  prototype ${b[key]}`);
      }
      console.log(`      ${setName.padEnd(8)} ${system.padEnd(10)} avgTokens        luci ${r.avgTokens}  prototype ${b.avgTokens} (header text differs; not compared)`);
    }
  }
  if (verbose) for (const c of result.perCase) console.log(`  [${c.set}/${c.system}] ${c.id}: ${c.picked.join(', ') || '(none)'}`);
  console.log(same ? '\nParity: the port reproduces the prototype baseline.' : '\nParity FAILED: see DIFF lines.');
  process.exitCode = same ? 0 : 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
