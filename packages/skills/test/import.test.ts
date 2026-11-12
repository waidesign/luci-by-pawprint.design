import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@luci/format';
import {
  SkillRegistry,
  convertToLss,
  detectLicenseFromText,
  guessCategory,
  installSkill,
  licenseCategory,
  lintSkillFolder,
  normalizeLicense,
  parseGitHubUrl,
  planSplit,
  prepareSkill,
  previewSkill,
  resolveSkillLicense,
  toSkillName,
  type GitHubClient
} from '@luci/skills';
import { tempDir } from './helpers.js';

// Ported from the prototype: skill-import.test.js
describe('licences', () => {
  it('normalise names and read licence texts', () => {
    expect(normalizeLicense('MIT')).toBe('MIT');
    expect(normalizeLicense('Apache 2.0')).toBe('Apache-2.0');
    expect(normalizeLicense('Apache License 2.0')).toBe('Apache-2.0');
    expect(normalizeLicense('Proprietary. LICENSE.txt has complete terms')).toBe('Proprietary');
    expect(normalizeLicense('Complete terms in LICENSE.txt')).toBeNull();
    expect(normalizeLicense('NOASSERTION')).toBeNull();
    expect(detectLicenseFromText('MIT License\n\nPermission is hereby granted, free of charge, to any person')).toBe('MIT');
    expect(detectLicenseFromText('                Apache License\n          Version 2.0, January 2004')).toBe('Apache-2.0');
    expect(detectLicenseFromText('© 2025 Example Inc. All rights reserved.')).toBe('Proprietary');
    expect(licenseCategory('MIT')).toBe('open');
    expect(licenseCategory('GPL-3.0')).toBe('copyleft');
    expect(licenseCategory('Proprietary')).toBe('restricted');
    expect(licenseCategory(null)).toBe('unknown');
  });

  it('evidence order: skill LICENSE file, then SKILL.md, then repository; README never counts', async () => {
    const files: Record<string, string> = {
      'skills/a/SKILL.md': '---\nname: a\nlicense: MIT\n---\nbody',
      'skills/a/LICENSE.txt': 'Apache License\nVersion 2.0, January 2004',
      'skills/b/SKILL.md': '---\nname: b\nlicense: MIT\n---\nbody',
      'skills/c/SKILL.md': '---\nname: c\n---\nbody',
      'README.md': 'License: MIT'
    };
    const fake = (repoLicense: unknown) => ({
      tree: async () => ({ branch: 'main', blobs: Object.keys(files).map(p => ({ path: p, size: 10 })) }),
      raw: async (_repo: string, _branch: string, p: string) => files[p] ?? null,
      repoLicense: async () => repoLicense
    }) as unknown as GitHubClient;
    const github = fake({ spdx: 'BSD-3-Clause', name: null, url: 'https://example/LICENSE', text: '' });
    expect((await resolveSkillLicense(github, { repo: 'o/r', path: 'skills/a/SKILL.md' })).spdx).toBe('Apache-2.0');
    expect((await resolveSkillLicense(github, { repo: 'o/r', path: 'skills/b/SKILL.md' })).evidence).toBe('declared in original SKILL.md');
    expect(await resolveSkillLicense(github, { repo: 'o/r', path: 'skills/c/SKILL.md' })).toMatchObject({ spdx: 'BSD-3-Clause', evidence: 'repository license' });
    expect(await resolveSkillLicense(fake(null), { repo: 'o/r', path: 'skills/c/SKILL.md' })).toMatchObject({ spdx: null, category: 'unknown' });
  });
});

describe('GitHub links', () => {
  it('parse links to repos, folders and SKILL.md files', () => {
    expect(parseGitHubUrl('https://github.com/o/r')).toEqual({ repo: 'o/r', branch: null, path: '' });
    expect(parseGitHubUrl('https://github.com/o/r/tree/main/skills/pdf')).toEqual({ repo: 'o/r', branch: 'main', path: 'skills/pdf' });
    expect(parseGitHubUrl('https://github.com/o/r/blob/main/skills/pdf/SKILL.md')).toEqual({ repo: 'o/r', branch: 'main', path: 'skills/pdf' });
    expect(parseGitHubUrl('./local/folder')).toBeNull();
  });

  it('a GitHub link needs an explicit client: nothing reaches the network by default', async () => {
    await expect(prepareSkill('https://github.com/o/r/tree/main/skills/x')).rejects.toThrow(/GitHub client is required/);
  });
});

describe('converting and splitting', () => {
  it('converts legacy and non-standard skills without losing data', () => {
    const text = '---\nid: "orbits"\nname: "Satellite Orbits"\ncategory: "science"\ndescription: >\n  Compute orbits.\n  Use for orbital mechanics.\ntags: ["orbits", "science"]\ndependencies: ["math"]\nhooks:\n  Stop:\n    - type: command\n---\nBody';
    const { data, content, raw } = parseFrontmatter(text);
    const { data: out, contract, warnings } = convertToLss({ data, content, category: 'science', raw });
    expect(out.name).toBe('orbits');
    expect(out.description).toBe('Compute orbits. Use for orbital mechanics.');
    expect(out.metadata['luci-title']).toBe('Satellite Orbits');
    expect(contract.dependsOn).toEqual(['math']);
    expect(contract.extraFrontmatter?.['hooks']).toBe('hooks:\n  Stop:\n    - type: command');
    expect(contract.lss).toBe(1);
    expect(warnings.some(w => w.includes('hooks'))).toBe(true);
    expect(toSkillName('My Cool Skill!')).toBe('my-cool-skill');
  });

  it('splits oversized skills losslessly, never inside code blocks', () => {
    const section = (n: number) => `## Section ${n}\n\n${'Detail sentence for this part. '.repeat(64)}`;
    const body = `# Big Skill\n\nIntro paragraph.\n\n\`\`\`md\n## Not a heading (inside code)\n\`\`\`\n\n${Array.from({ length: 16 }, (_, i) => section(i + 1)).join('\n\n')}`;
    const plan = planSplit(body, { skillName: 'big-skill' });
    if (!plan) throw new Error('expected a split');
    expect(plan.after).toBeLessThan(5000);
    expect(plan.references.length).toBeLessThan(plan.references.reduce((n, r) => n + r.headings.length, 0));
    expect(plan.main).toContain('## Detailed references');
    expect(plan.main).toContain('## Not a heading (inside code)');
    const combined = [plan.main, ...plan.references.map(r => r.content)].join('\n');
    for (const line of body.split('\n').filter(l => l.trim())) expect(combined).toContain(line.trimEnd());
    expect(planSplit('small body')).toBeNull();
  });
});

describe('skills add from local files', () => {
  it('a local folder becomes an LSS skill with licence, permissions and split', async () => {
    const src = tempDir('luci-add-src-');
    const big = `# Tool\n\nIntro.\n\n${[1, 2, 3, 4, 5].map(n => `## Part ${n}\n\n${'Words of guidance. '.repeat(400)}`).join('\n\n')}`;
    fs.writeFileSync(path.join(src, 'SKILL.md'), `---\nname: my-tool\ndescription: Do the tool thing. Use when tooling.\nlicense: MIT\n---\n${big}`, 'utf8');
    fs.mkdirSync(path.join(src, 'scripts'));
    fs.writeFileSync(path.join(src, 'scripts', 'run.sh'), 'echo hi', 'utf8');

    const root = tempDir('luci-add-lib-');
    const prepared = await prepareSkill(src);
    const preview = previewSkill(prepared, { root, category: 'workflow' });
    expect(preview.name).toBe(toSkillName(path.basename(src)));
    expect(preview.contract.permissions).toEqual(['shell']);
    expect(preview.split).toBeTruthy();
    const { dir, copied } = await installSkill(prepared, preview);
    expect(copied).toBe(1);
    expect(fs.existsSync(path.join(dir, 'scripts', 'run.sh'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'luci.json'))).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'references')).length).toBeGreaterThanOrEqual(1);
    expect(lintSkillFolder(dir).errors).toEqual([]);
  });

  it('unlicensed oversized skills are not modified', async () => {
    const src = tempDir('luci-add-nolic-');
    const file = path.join(src, 'big-notes.md');
    fs.writeFileSync(file, `# Notes\n\n${[1, 2, 3, 4].map(n => `## Part ${n}\n\n${'Text. '.repeat(1200)}`).join('\n\n')}`, 'utf8');
    const preview = previewSkill(await prepareSkill(file), { root: tempDir() });
    expect(preview.split).toBeNull();
    expect(preview.oversizedNotSplit).toBe(true);
    expect(preview.warnings.some(w => w.includes('not split'))).toBe(true);
    expect(preview.warnings.some(w => w.includes('No licence'))).toBe(true);
  });

  it('categories are guessed from whole words', () => {
    expect(guessCategory('Fill PDF forms')).toBe('documents');
    expect(guessCategory('Theme variables for buttons')).toBe('general');
    expect(guessCategory('Deploy to Kubernetes')).toBe('cloud-infra');
  });

  it('the registry refreshes index.json when skills change', async () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'general', 'one'), { recursive: true });
    fs.writeFileSync(path.join(root, 'general', 'one', 'SKILL.md'), '---\nname: one\ndescription: First skill for testing.\n---\nBody', 'utf8');
    await new SkillRegistry({ skillsDir: root }).loadSkills();
    expect(fs.existsSync(path.join(root, 'index.json'))).toBe(true);
    fs.mkdirSync(path.join(root, 'general', 'two'), { recursive: true });
    fs.writeFileSync(path.join(root, 'general', 'two', 'SKILL.md'), '---\nname: two\ndescription: Second skill for testing.\n---\nBody', 'utf8');
    const registry = new SkillRegistry({ skillsDir: root });
    await registry.loadSkills();
    expect(registry.loadedFromIndex).toBe(false);
    expect((JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')) as { skills: unknown[] }).skills).toHaveLength(2);
  });
});
