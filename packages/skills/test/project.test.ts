import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PACKS_DIR,
  SkillDiscovery,
  SkillOrchestrator,
  SkillRegistry,
  addPack,
  addedPacks,
  catalogPath,
  deselectSkills,
  detectPacks,
  loadPacks,
  loadProjectSkillsForTask,
  missingSkillWarnings,
  needsCaution,
  packSkills,
  projectSkillSet,
  readLock,
  readSkillPreferences,
  removePack,
  selectSkills,
  shareSkillWithProject,
  trustLevel,
  updateSkillPreferences,
  validatePack,
  writeCatalog,
  writeSkillFolder,
  lintSkillFolder
} from '@luci-dev/skills';
import { addSkill, tempDir } from './helpers.js';

const official = new SkillRegistry({ autoIndex: false });
const project = (deps: Record<string, string> = {}, files: Record<string, string> = {}) => {
  const dir = tempDir('luci-project-');
  fs.mkdirSync(path.join(dir, '.luci'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return { dir, info: { projectPath: dir, dependencies: Object.keys(deps), hasUi: true } };
};

// Ported from the prototype: project-context.test.js (skills parts)
describe('project skills', () => {
  it('select records version and reason; unknown and duplicate IDs are reported', async () => {
    const { dir } = project();
    const res = await selectSkills(dir, official, ['pricing-page', 'not-a-skill'], 'Plan page for the shop');
    expect(res.added).toEqual(['pricing-page']);
    expect(res.unknown).toEqual(['not-a-skill']);
    expect((await selectSkills(dir, official, ['pricing-page'])).already).toEqual(['pricing-page']);
    const lock = readLock(dir);
    expect(lock.skills).toHaveLength(1);
    expect(lock.skills[0]).toMatchObject({ id: 'pricing-page', reason: 'Plan page for the shop' });
    expect(lock.skills[0]?.version).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(path.join(dir, '.luci', 'skills.lock.json'), 'utf8')).lss).toBe(1);
    expect(deselectSkills(dir, ['pricing-page'])).toEqual(['pricing-page']);
    expect(readLock(dir).skills).toHaveLength(0);
  });

  it('the catalog has short entries with a path, never skill bodies', async () => {
    const { dir } = project();
    await selectSkills(dir, official, ['pricing-page'], 'Plan page');
    writeSkillFolder(path.join(dir, '.luci', 'skills', 'shop-rules'), {
      data: { name: 'shop-rules', description: 'House rules for the shop. Use when changing checkout code.', license: 'MIT' },
      content: '# Shop rules\n\nSecret detailed body.',
      contract: { lss: 1 }
    });
    await writeCatalog(dir, official);
    const catalog = fs.readFileSync(path.join(dir, '.luci', 'project-skills.md'), 'utf8');
    expect(catalog).toContain('(`pricing-page`)');
    expect(catalog).toContain('**Why chosen**: Plan page');
    expect(catalog).toContain('(`shop-rules`)');
    expect(catalog).toContain('`.luci/skills/shop-rules/SKILL.md`');
    expect(catalog).not.toContain('Secret detailed body');
    expect(catalog).not.toMatch(/gaw|ai-brain/i);
    // Luci's own library sits inside the installed package: named, never a path on this machine
    expect(catalog).toContain('`luci skills use pricing-page --full` or the MCP tool `get_skill` (`pricing-page`)');
    expect(catalog).not.toMatch(/(?<![A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/var\/folders\//);
    expect(catalog).not.toContain(path.dirname(dir).replace(/\\/g, '/'));
  });

  it('the catalog names a personal skill under Luci\'s home folder, never the user\'s own path', async () => {
    // test-setup.ts gives every test file a temporary LUCI_HOME; the personal library lives in it
    const personal = path.join(process.env['LUCI_HOME']!, 'skills');
    addSkill(personal, 'general', 'team-voice', 'Write in the team voice. Use when drafting release notes.');
    const registry = new SkillRegistry({ user: true, userSkillsDir: personal, autoIndex: false });
    const { dir } = project();
    await selectSkills(dir, registry, ['team-voice', 'pricing-page']);
    await writeCatalog(dir, registry);
    const catalog = fs.readFileSync(path.join(dir, '.luci', 'project-skills.md'), 'utf8');
    expect(catalog).toContain('`$LUCI_HOME/skills/general/team-voice/SKILL.md`');
    expect(catalog).toContain('_`$LUCI_HOME` is the folder named in the LUCI_HOME environment variable');
    expect(catalog).not.toContain(process.env['LUCI_HOME']!.replace(/\\/g, '/'));
    expect(catalog).not.toMatch(/(?<![A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/var\/folders\//);
  });

  it('catalogPath: relative for project skills, ~/.luci for personal ones, none for the official library or elsewhere', () => {
    const base = tempDir('luci-paths-');
    const projectDir = path.join(base, 'my shop');
    const home = { dir: path.join(base, 'home', '.luci'), label: '~/.luci' };
    const file = (...parts: string[]) => path.join(...parts, 'SKILL.md');
    expect(catalogPath(projectDir, { library: 'project', filePath: file(projectDir, '.luci', 'skills', 'shop-rules') }, home)).toBe('.luci/skills/shop-rules/SKILL.md');
    expect(catalogPath(projectDir, { library: 'personal', filePath: file(home.dir, 'skills', 'general', 'voice') }, home)).toBe('~/.luci/skills/general/voice/SKILL.md');
    expect(catalogPath(projectDir, { library: 'personal', filePath: file(home.dir, 'skills', 'general', 'voice') }, { ...home, label: '$LUCI_HOME' })).toBe('$LUCI_HOME/skills/general/voice/SKILL.md');
    // A personal library outside Luci's home folder, or Luci's own library: named instead of a path
    expect(catalogPath(projectDir, { library: 'personal', filePath: file(base, 'elsewhere', 'voice') }, home)).toBeNull();
    expect(catalogPath(projectDir, { library: 'official', filePath: file(base, 'node_modules', '@luci-dev', 'skills', 'library', 'tdd') }, home)).toBeNull();
    expect(catalogPath(projectDir, { library: 'project' }, home)).toBeNull();
    // The ~/.luci form leads back to the same file once ~ is the home folder (as agents and shells expand it)
    const written = catalogPath(projectDir, { library: 'personal', filePath: file(home.dir, 'skills', 'general', 'voice') }, home)!;
    expect(path.join(path.dirname(home.dir), ...written.slice(2).split('/'))).toBe(file(home.dir, 'skills', 'general', 'voice'));
  });

  it('only the project skills that fit the task are loaded', async () => {
    const { dir } = project();
    await selectSkills(dir, official, ['pricing-page', 'fixing-accessibility']);
    expect((await loadProjectSkillsForTask(dir, official, 'Design a SaaS pricing page with plans')).skills.map(s => s.id)).toEqual(['pricing-page']);
    expect((await loadProjectSkillsForTask(dir, official, 'Set up Kubernetes on Azure')).skills).toHaveLength(0);
  });

  it('a selection this machine lacks is reported', async () => {
    const { dir } = project();
    await selectSkills(dir, official, ['pricing-page']);
    fs.writeFileSync(path.join(dir, '.luci', 'skills.lock.json'), JSON.stringify({ lss: 1, skills: [...readLock(dir).skills, { id: 'removed-skill', version: '1.0.0' }] }), 'utf8');
    const set = await projectSkillSet(dir, official);
    expect(set.selected.map(s => s.id)).toEqual(['pricing-page']);
    expect(missingSkillWarnings(readLock(dir), set.missing).some(w => w.includes('removed-skill'))).toBe(true);
  });

  it('an invalid lockfile is flagged, not thrown', () => {
    const { dir } = project();
    fs.writeFileSync(path.join(dir, '.luci', 'skills.lock.json'), '{ nope', 'utf8');
    expect(readLock(dir)).toMatchObject({ skills: [], invalid: true });
  });
});

// Ported from the prototype: personal-library.test.js
describe('personal library, trust and preferences', () => {
  function setup() {
    const officialDir = tempDir('luci-official-');
    const personal = tempDir('luci-personal-');
    const prefs = path.join(tempDir('luci-brain-'), 'skill-preferences.json');
    addSkill(officialDir, 'ui-ux', 'pricing-page', 'Design SaaS pricing pages with plan comparison tables. Use when building a pricing page.');
    addSkill(officialDir, 'testing', 'tdd', 'Test-driven development with red-green-refactor. Use when writing tests first.');
    addSkill(personal, 'general', 'my-release-notes', 'Write release notes in my team style. Use when drafting release notes.');
    addSkill(personal, 'general', 'repo-deployer', 'Deploy repositories with a shell script. Use when deploying a repo.',
      { lss: 1, permissions: ['shell'], source: { repo: 'someone/skills', path: 'repo-deployer/SKILL.md' } });
    const registry = () => new SkillRegistry({ skillsDir: officialDir, user: true, userSkillsDir: personal, preferencesFile: prefs, autoIndex: false });
    return { officialDir, personal, prefs, registry };
  }

  it('off by default, merged when user data is on', async () => {
    const { officialDir, registry } = setup();
    const plain = await new SkillRegistry({ skillsDir: officialDir, autoIndex: false }).getAllSkills();
    expect(plain.map(s => s.id).sort()).toEqual(['pricing-page', 'tdd']);
    const merged = await registry().getAllSkills();
    expect(merged).toHaveLength(4);
    const notes = merged.find(s => s.id === 'my-release-notes');
    expect(notes?.library).toBe('personal');
    expect(notes?.dir?.startsWith(registry().personalDir ?? '?')).toBe(true);
  });

  it('trust levels: official, personal, community; a skill cannot declare itself verified', async () => {
    const { personal, registry } = setup();
    addSkill(personal, 'general', 'sneaky', 'Claims to be verified. Use when testing trust.', { lss: 1, verified: { commit: 'abc' }, trust: 'verified', source: { repo: 'x/y', path: 'SKILL.md' } });
    const r = registry();
    await r.ensureLoaded();
    const get = (id: string) => r.skills.get(id)!;
    expect(trustLevel(get('pricing-page'))).toBe('official');
    expect(trustLevel(get('my-release-notes'))).toBe('personal');
    expect(trustLevel(get('repo-deployer'))).toBe('community');
    expect(trustLevel(get('sneaky'))).toBe('community');
    expect(needsCaution(get('repo-deployer'))).toBe(true);
    expect(needsCaution(get('my-release-notes'))).toBe(false);
  });

  it('a personal skill with an official name replaces it for this user only', async () => {
    const { personal, officialDir, registry } = setup();
    addSkill(personal, 'testing', 'tdd', 'My own TDD flow with property tests. Use when writing tests first my way.');
    const r = registry();
    await r.ensureLoaded();
    expect(r.skills.get('tdd')).toMatchObject({ library: 'personal', overrides: 'official' });
    expect(r.overrides).toEqual(['tdd']);
    expect((await new SkillRegistry({ skillsDir: officialDir, autoIndex: false }).getSkill('tdd'))?.library).toBe('official');
  });

  it('blocked skills are never suggested; pins boost only skills that already fit', async () => {
    const { prefs, registry } = setup();
    expect((await new SkillDiscovery(registry()).findRelevant('build a pricing page')).some(s => s.id === 'pricing-page')).toBe(true);
    updateSkillPreferences('block', ['pricing-page'], prefs);
    let r = registry();
    expect(await new SkillDiscovery(r).findRelevant('build a pricing page')).toHaveLength(0);
    expect((await new SkillDiscovery(r).search('pricing page', { includeBlocked: true })).some(s => s.id === 'pricing-page')).toBe(true);
    expect((await new SkillOrchestrator(r).loadSkillsForTask('<pricing-page>')).skills.map(s => s.id)).toEqual(['pricing-page']);

    updateSkillPreferences('pin', ['pricing-page', 'tdd'], prefs);
    expect(readSkillPreferences(prefs)).toEqual({ pinned: ['pricing-page', 'tdd'], blocked: [] });
    r = registry();
    const scored = await new SkillDiscovery(r).search('pricing page', { withScores: true });
    expect(scored[0]).toMatchObject({ pinned: true });
    expect(scored[0]?.skill.id).toBe('pricing-page');
    expect((await new SkillDiscovery(r).findRelevant('build a pricing page')).some(s => s.id === 'tdd')).toBe(false);
  });

  it('agent instructions name the source and a caution only for unreviewed skills', async () => {
    const r = setup().registry();
    expect((await new SkillOrchestrator(r).loadSkillsByIds(['pricing-page'])).formattedInstructions).not.toContain('**Source**');
    const community = (await new SkillOrchestrator(r).loadSkillsByIds(['repo-deployer'])).formattedInstructions;
    expect(community).toMatch(/\*\*Source\*\*: community/);
    expect(community).toMatch(/\*\*Caution\*\*/);
  });

  it('a personal skill is recorded as personal; teammates get a share hint; share copies it in', async () => {
    const { officialDir, registry } = setup();
    const { dir } = project();
    const r = registry();
    await selectSkills(dir, r, ['my-release-notes', 'repo-deployer', 'pricing-page']);
    const entry = (id: string) => readLock(dir).skills.find(s => s.id === id);
    expect(entry('my-release-notes')?.library).toBe('personal');
    expect(entry('repo-deployer')?.from).toBe('https://github.com/someone/skills');
    expect(entry('pricing-page')?.library).toBeUndefined();

    const teammate = new SkillRegistry({ skillsDir: officialDir, autoIndex: false });
    const before = await projectSkillSet(dir, teammate);
    expect(missingSkillWarnings(readLock(dir), before.missing).some(w => w.includes('personal library') && w.includes('luci skills share'))).toBe(true);

    const { dir: shared } = shareSkillWithProject(dir, (await r.getSkill('my-release-notes'))!);
    expect(fs.existsSync(path.join(shared, 'SKILL.md'))).toBe(true);
    expect(readLock(dir).skills.some(s => s.id === 'my-release-notes')).toBe(false);
    const after = await projectSkillSet(dir, teammate);
    expect(after.own.some(s => s.id === 'my-release-notes' && trustLevel(s) === 'project')).toBe(true);
    expect(() => shareSkillWithProject(dir, { id: 'my-release-notes', dir: shared })).toThrow(/already has a skill/);
  });
});

// Ported from the prototype: packs.test.js (on Luci's library and packs)
describe('packs', () => {
  const packs = loadPacks();
  const byName = new Map(packs.map(p => [p.name, p]));

  it('shipped packs are valid; every skill exists and ships all its files', async () => {
    expect(packs).toHaveLength(fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json')).length);
    expect(packs.map(p => p.name).sort()).toEqual(['design-system', 'design-system-build', 'marketing', 'motion', 'ui']);
    const known = new Set((await official.getAllSkills()).map(s => s.id));
    for (const pack of packs) {
      expect(validatePack(pack, known), pack.name).toEqual([]);
      for (const w of pack.when ?? []) expect((w.dependencies ?? []).length || (w.files ?? []).length, pack.name).toBeTruthy();
      for (const id of [...(pack.skills ?? []), ...(pack.when ?? []).flatMap(w => w.skills)]) {
        const { errors, warnings } = lintSkillFolder((await official.getSkill(id))?.dir ?? '');
        expect(errors, `${pack.name}/${id}`).toEqual([]);
        expect(warnings.some(w => /Broken link|doesn't include/.test(w)), `${pack.name}/${id}`).toBe(false);
      }
    }
  });

  it('validatePack rejects packs without signals or skills, or with a bad name', () => {
    expect(validatePack({ name: 'x', title: 'X', description: 'd', signals: {}, skills: ['a'] }).some(p => p.includes('signals'))).toBe(true);
    expect(validatePack({ name: 'x', title: 'X', description: 'd', signals: { always: true } }).some(p => p.includes('no skills'))).toBe(true);
    expect(validatePack({ name: 'X Y', title: 'X', description: 'd', signals: { always: true }, skills: ['a'] }).some(p => p.includes('name'))).toBe(true);
  });

  it('detection uses dependencies, files and whole goal words; UI packs need a UI', () => {
    const { dir, info } = project({ react: '^18', motion: '^12' }, { 'components.json': '{}' });
    const found = new Map(detectPacks(packs, info, { projectDir: dir }).map(p => [p.pack.name, p.reasons]));
    expect([...found.keys()].sort()).toEqual(['design-system', 'motion', 'ui']);
    expect(found.get('motion')?.[0]).toContain('motion is in package.json');
    expect(found.get('design-system')?.some(r => r.includes('components.json'))).toBe(true);
    expect(detectPacks(packs, info, { projectDir: dir, goal: 'Landing page for a bakery' }).map(p => p.pack.name)).toContain('marketing');
    expect(detectPacks(packs, info, { projectDir: dir, goal: 'islanding' }).some(p => p.pack.name === 'marketing')).toBe(false);
    expect(detectPacks(packs, info, { projectDir: dir }).some(p => p.pack.name === 'design-system-build')).toBe(false);
    expect(detectPacks(packs, info, { projectDir: dir, goal: 'We want to build a design system for our app' }).some(p => p.pack.name === 'design-system-build')).toBe(true);
    expect(detectPacks(packs, { ...info, hasUi: false }, { projectDir: dir, goal: 'pricing API' })).toEqual([]);
  });

  it('pack skills: stack-specific extras and only the installed animation library', async () => {
    const gsap = project({ react: '^18', gsap: '^3' });
    const motionIds = (await packSkills(byName.get('motion')!, gsap.info, official)).skills.map(s => s.id);
    expect(motionIds).toContain('masked-reveal');
    const noLib = project({ react: '^18' });
    expect((await packSkills(byName.get('motion')!, noLib.info, official)).skills.map(s => s.id)).not.toContain('masked-reveal');

    const ui = (await packSkills(byName.get('ui')!, noLib.info, official)).skills.map(s => s.id);
    expect(ui).toContain('react-best-practices');
    expect(ui).not.toContain('tailwindcss');
    expect(ui).not.toContain('shadcn');
    fs.writeFileSync(path.join(noLib.dir, 'components.json'), '{}', 'utf8');
    expect((await packSkills(byName.get('ui')!, noLib.info, official)).skills.some(s => s.id === 'shadcn' && s.reason.includes('components.json found'))).toBe(true);
  });

  it('add / remove: shared skills stay while another pack uses them; hand-picked skills are never removed', async () => {
    const { dir, info } = project({ react: '^18', tailwindcss: '^4' });
    await selectSkills(dir, official, ['fixing-accessibility'], 'Chosen by hand');
    const ui = await addPack(dir, official, byName.get('ui')!, info);
    expect(ui.added).toContain('tailwindcss');
    expect(ui.already).toContain('fixing-accessibility');
    expect((await addPack(dir, official, byName.get('design-system')!, info)).tagged.sort()).toEqual(['baseline-ui', 'tailwindcss']);
    expect(addedPacks(dir)).toEqual(['design-system', 'ui']);

    const { removed, kept } = removePack(dir, 'ui');
    expect(removed).toContain('accessibility-baseline');
    expect(kept.sort()).toEqual(['baseline-ui', 'tailwindcss']);
    const lock = readLock(dir).skills;
    expect(lock.some(s => s.id === 'fixing-accessibility' && !s.packs)).toBe(true);
    expect(lock.find(s => s.id === 'tailwindcss')?.reason).toBe('Pack "design-system"');
    expect(addedPacks(dir)).toEqual(['design-system']);
  });
});

// Ported from the prototype: brain-layout.test.js "one animation library per task" (fixture library:
// Luci ships one animation-library skill, so two are made here)
describe('skills that do the same job', () => {
  const library = () => {
    const root = tempDir();
    const reveal = 'Masked staggered word reveals on scroll for headings and hero copy. Use when animating a headline word reveal on scroll.';
    addSkill(root, 'animation-motion', 'gsap-reveal', reveal, { lss: 1, exclusiveGroup: 'animation-library', packages: ['gsap'] });
    addSkill(root, 'animation-motion', 'motion-reveal', `${reveal} With Motion.`, { lss: 1, exclusiveGroup: 'animation-library', packages: ['motion'] });
    return new SkillRegistry({ skillsDir: root, autoIndex: false });
  };

  it('one animation library per task, chosen from the project dependencies', async () => {
    const loaded = await new SkillOrchestrator(library()).loadSkillsForTask('add a masked word reveal on scroll to the hero headline', { dependencies: ['react', 'motion'] });
    const ids = loaded.skills.map(s => s.id);
    expect(ids).toContain('motion-reveal');
    expect(ids).not.toContain('gsap-reveal');
    expect(loaded.excludedSkills.some(e => e.id === 'gsap-reveal' && e.reason.includes('motion'))).toBe(true);
  });

  it('named explicitly: both are kept, with a conflict note', async () => {
    const explicit = await new SkillOrchestrator(library()).loadSkillsForTask('gsap-reveal motion-reveal', { dependencies: ['motion'] });
    expect(explicit.skills.map(s => s.id)).toEqual(['gsap-reveal', 'motion-reveal']);
    expect(explicit.conflictResolutions.some(c => c.resolution.includes('prefer motion-reveal'))).toBe(true);
  });
});
