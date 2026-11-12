import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { stringifyFrontmatter } from '@luci/format';
import { writeSkillFolder } from '@luci/skills';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A throwaway folder, removed after each test. */
export function tempDir(prefix = 'luci-skills-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

/** A small library: one LSS skill (pricing-page) and one legacy single-file skill. */
export function makeLibrary(): string {
  const root = tempDir('luci-lib-');
  const dir = path.join(root, 'ui-ux', 'pricing-page');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), stringifyFrontmatter({
    name: 'pricing-page',
    description: 'Design SaaS pricing pages with plan comparison and billing toggles.',
    license: 'MIT',
    metadata: { 'luci-title': 'Pricing Page', 'luci-category': 'ui-ux', 'luci-tags': 'pricing, plans' }
  }, '# Pricing\n\nInstructions.'), 'utf8');
  fs.writeFileSync(path.join(dir, 'luci.json'), JSON.stringify({ lss: 1, keywords: ['subscription'], frameworks: ['react'] }), 'utf8');
  fs.writeFileSync(path.join(root, 'ui-ux', 'old-skill.md'), '---\nid: "old-skill"\nname: "Old Skill"\ndescription: "A legacy skill file."\n---\nBody', 'utf8');
  return root;
}

/** Write one LSS skill folder into `root/<category>/<name>`. */
export function addSkill(root: string, category: string, name: string, description: string, contract: Record<string, unknown> = { lss: 1 }, body = `# ${name}\n\nInstructions for ${name}.`): string {
  const dir = path.join(root, category, name);
  writeSkillFolder(dir, { data: { name, description, license: 'MIT', metadata: { 'luci-category': category } }, content: body, contract });
  return dir;
}
