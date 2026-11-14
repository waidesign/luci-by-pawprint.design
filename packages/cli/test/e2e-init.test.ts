import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { parseBrainJson } from '@luci/format';
import { tempDir } from './helpers.js';

// Ported from the prototype: e2e-init.test.js, on the same sample React project
const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/sample-react-project/', import.meta.url));

// Runs several CLI processes one after another: about 6 s alone, over 30 s when the whole suite runs
// in parallel, so it gets its own limit
it('luci init on the sample React project: memory, agent files, onboarding answers, doctor clean', { timeout: 90_000 }, () => {
  const dir = tempDir('luci-e2e-');
  const home = tempDir('luci-e2e-home-');
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const luci = (input: string, ...args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: dir, input, encoding: 'utf8', env: { ...process.env, LUCI_HOME: home } });

  // Answers piped in, as in a scripted setup: goal (no library skill matches it), "n" to the
  // UI pack offered for a React project, one rule, then Enter to finish
  const init = luci('Recipe sharing app for home cooks\nn\nShow every price in euros\n\n', 'init', '-i');
  expect(init.status, init.stderr).toBe(0);
  expect(init.stdout).toContain('ui: UI basics');
  expect(init.stdout).toContain('No packs added');

  const brain = parseBrainJson(fs.readFileSync(path.join(dir, '.luci', 'brain.json'), 'utf8'));
  if (!brain.ok) throw new Error(brain.error);
  expect(brain.value.project).toMatchObject({ name: 'fixture-react-project', framework: 'react-vite', hasUi: true, languages: ['TypeScript'] });

  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');
  expect(read('.luci/context.md')).toContain('## Project Goal\nRecipe sharing app for home cooks');
  expect(read('.luci/rules.md')).toContain('- Show every price in euros');
  expect(read('CLAUDE.md')).toContain('follow ./.luci/rules.md in every session');
  expect(read('.cursorrules')).toContain('follow ./.luci/rules.md in every session');
  expect(read('.luci/local/global-brain.md')).toContain('# Global Brain (summary)');

  const doctor = spawnSync(process.execPath, [BIN, 'doctor'], { cwd: dir, encoding: 'utf8', env: { ...process.env, LUCI_HOME: home } });
  expect(doctor.status, doctor.stdout).toBe(0);
  expect(doctor.stdout).toContain('No problems.');
  expect(doctor.stdout).toContain('Goal:         Recipe sharing app for home cooks');

  // Idempotent: a second run changes no file someone edited
  const rulesBefore = read('.luci/rules.md');
  expect(luci('', 'init', '--yes').status).toBe(0);
  expect(read('.luci/rules.md')).toBe(rulesBefore);
});
