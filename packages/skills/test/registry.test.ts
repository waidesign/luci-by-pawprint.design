import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '@luci-dev/format';
import { OFFICIAL_SKILLS_DIR, SkillRegistry, lintLibrary, lintSkillFolder } from '@luci-dev/skills';
import { makeLibrary, tempDir } from './helpers.js';

// Ported from the prototype: gss.test.js and skill-registry.test.js
describe('the shipped library', () => {
  it('has no lint errors or warnings', () => {
    const { errorCount, warningCount, results } = lintLibrary(OFFICIAL_SKILLS_DIR);
    const failing = results.filter(r => r.errors.length || r.warnings.length).map(r => `${r.name}: ${[...r.errors, ...r.warnings].join('; ')}`);
    expect(errorCount, failing.join('\n')).toBe(0);
    expect(warningCount, failing.join('\n')).toBe(0);
  });

  it('index.json is up to date (rebuild with scripts/build-library.mjs)', () => {
    const registry = new SkillRegistry({ autoIndex: false });
    const saved = JSON.parse(fs.readFileSync(path.join(OFFICIAL_SKILLS_DIR, 'index.json'), 'utf8')) as unknown;
    expect(saved).toEqual(JSON.parse(JSON.stringify(registry.buildIndex())));
  });

  it('every skill has a redistributable licence: verified open source, or Luci\'s own', async () => {
    for (const skill of await new SkillRegistry({ autoIndex: false }).getAllSkills()) {
      const src = skill.contract.source;
      if (src) {
        expect(src.licenseStatus, skill.id).toBe('open');
        expect(fs.existsSync(path.join(skill.dir ?? '', 'NOTICE.md')), `${skill.id} NOTICE.md`).toBe(true);
      } else {
        expect(skill.author, `${skill.id} has no source, so it must be Luci's own`).toBe('Luci');
      }
      expect(['MIT', 'Apache-2.0']).toContain(skill.license);
    }
  });

  it('is design-focused and mentions no earlier product name', async () => {
    const skills = await new SkillRegistry({ autoIndex: false }).getAllSkills();
    expect(skills.length).toBeGreaterThanOrEqual(30);
    for (const s of skills) {
      expect(['cloud-infra', 'media-creative', 'documents', 'database', 'workflow'], s.id).not.toContain(s.category);
      expect(fs.readFileSync(s.filePath ?? '', 'utf8'), s.id).not.toMatch(/\bgaw\b|GAW|ai-brain/);
    }
  });

  it('loads baseline-ui with its body; validation finds unknown skills', async () => {
    const registry = new SkillRegistry({ autoIndex: false });
    const baseline = await registry.getSkill('baseline-ui');
    expect(baseline?.content.length).toBeGreaterThan(50);
    expect((await registry.validateSkill('baseline-ui')).valid).toBe(true);
    expect(await registry.validateSkill('non-existent-skill')).toEqual({ valid: false, errors: ['Skill not found'] });
    expect(await registry.getCategories()).toContain('design-systems');
  });
});

describe('registry', () => {
  it('maps SKILL.md + luci.json and still loads legacy single files', async () => {
    const registry = new SkillRegistry({ skillsDir: makeLibrary() });
    const skill = await registry.getSkill('pricing-page');
    expect(skill).toMatchObject({ name: 'Pricing Page', category: 'ui-ux', tags: ['pricing', 'plans'], keywords: ['subscription'], frameworks: ['react'], format: 'lss' });
    expect(skill?.content).toContain('Instructions.');
    expect(await registry.getSkill('old-skill')).toMatchObject({ format: 'legacy', name: 'Old Skill' });
  });

  it('with a fresh index, skill bodies load only when read', async () => {
    const root = makeLibrary();
    new SkillRegistry({ skillsDir: root }).writeIndex();
    const registry = new SkillRegistry({ skillsDir: root });
    await registry.loadSkills();
    expect(registry.loadedFromIndex).toBe(true);
    const file = path.join(root, 'ui-ux', 'pricing-page', 'SKILL.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Instructions.', 'Lazy-loaded.'), 'utf8');
    expect((await registry.getSkill('pricing-page'))?.content).toContain('Lazy-loaded.');
  });

  it('legacy frontmatter fields parse', () => {
    const parsed = parseFrontmatter('---\nid: "test-skill"\nname: "Test Skill"\ntags: ["unit", "ci"]\ndependencies: ["base-skill"]\n---\n\n# Test Skill Content\nBody.');
    expect(parsed.data).toMatchObject({ id: 'test-skill', name: 'Test Skill', tags: ['unit', 'ci'], dependencies: ['base-skill'] });
  });
});

describe('linter', () => {
  it('catches spec violations', () => {
    const dir = path.join(tempDir(), 'general', 'Bad_Name');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: Bad_Name\ndescription: ">"\ncategory: general\nmetadata:\n  luci-version: "1"\n---\nBody', 'utf8');
    fs.writeFileSync(path.join(dir, 'luci.json'), JSON.stringify({ lss: 1, keywords: 'not-a-list', dependsOn: ['missing-skill'] }), 'utf8');
    const text = lintSkillFolder(dir, new Set(['bad-name'])).errors.join('\n');
    expect(text).toContain('Unknown frontmatter field "category"');
    expect(text).toContain('lowercase letters');
    expect(text).toContain('placeholder');
    expect(text).toContain('"keywords" must be string[]');
    expect(text).toContain('dependsOn "missing-skill"');
  });

  it('description length is checked (unreachable in the prototype)', () => {
    const dir = path.join(tempDir(), 'general', 'tiny');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: tiny\ndescription: Too short\nlicense: MIT\n---\nBody', 'utf8');
    expect(lintSkillFolder(dir).warnings.join('\n')).toContain('very short');
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: tiny\ndescription: ${'word '.repeat(220)}\nlicense: MIT\n---\nBody`, 'utf8');
    expect(lintSkillFolder(dir).errors.join('\n')).toContain('longer than 1024');
  });
});
