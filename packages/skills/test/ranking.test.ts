import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SkillDiscovery,
  SkillOrchestrator,
  SkillRegistry,
  addDrafts,
  approveDrafts,
  enrichContract,
  lintLibrary,
  lintSkillFolder,
  listDrafts,
  prepareSkill,
  previewSkill,
  rankabilityLevel,
  readSkillFolder,
  rejectDrafts,
  splitSentences,
  writeSkillFolder,
  type Skill
} from '@luci/skills';
import { addSkill, tempDir } from './helpers.js';

const skill = (over: Partial<Skill> & Record<string, unknown> = {}) => ({
  id: 'pricing-page',
  name: 'Pricing Page',
  category: 'ui-ux',
  description: 'Design SaaS pricing pages with plan comparison. Use when building pricing or plan pages.',
  tags: [] as string[],
  content: '# Pricing\n\n## When not to use\n- Checkout and payment processing flows\n\n## Checklist\n- [ ] Toggle updates every price\n- [ ] Works with keyboard only',
  contract: { lss: 1 },
  ...over
}) as unknown as Skill;
const source = (skills: Skill[]) => ({ getAllSkills: async () => skills, getSkill: async (id: string) => skills.find(s => s.id === id) ?? null });

// Ported from the prototype: rankability.test.js
describe('rankability', () => {
  it('sentences keep "Three.js" intact', () => {
    expect(splitSentences('Build scenes with Three.js and WebGL. Use when making 3D.')).toEqual(['Build scenes with Three.js and WebGL.', 'Use when making 3D.']);
  });

  it('enrich fills fields from the skill text only, never overwriting authors', () => {
    const { contract, filled } = enrichContract(skill({ contract: { lss: 1, summary: 'Author summary.' } }));
    expect(contract.summary).toBe('Author summary.');
    expect(contract.whenToUse).toEqual(['Use when building pricing or plan pages.']);
    expect(contract.whenNotToUse).toEqual(['Checkout and payment processing flows']);
    expect(contract.verification).toEqual(['Toggle updates every price', 'Works with keyboard only']);
    expect(contract.domains).toEqual(['design', 'web']);
    expect(filled).not.toContain('summary');
    expect(contract.derived).toEqual(['domains', 'verification', 'whenNotToUse', 'whenToUse']);
    expect(contract.keywords).toBeUndefined();
  });

  it('levels follow LSS Ranking v1', () => {
    expect(rankabilityLevel(skill({ description: 'Pricing pages.' })).level).toBe(0);
    expect(rankabilityLevel(skill()).level).toBe(1);
    const rankableContract = { lss: 1, summary: 's', whenToUse: ['w'], domains: ['design'], keywords: ['subscription'] };
    const rankable = skill({ tags: ['pricing', 'plans'], contract: rankableContract });
    expect(rankabilityLevel(rankable).level).toBe(2);
    expect(rankabilityLevel(skill({ tags: ['pricing', 'plans'], contract: { ...rankableContract, whenNotToUse: ['checkout'], verification: ['v'] } })).level).toBe(3);
    expect(rankabilityLevel(skill({ tags: ['pricing', 'plans'], contract: { ...rankableContract, drafts: ['keywords'] } })).level).toBe(1);
  });

  it('whenNotToUse keeps a skill out of matching tasks', async () => {
    const skills = [
      skill({ contract: { lss: 1, whenNotToUse: ['Checkout and payment processing flows'] } }),
      skill({ id: 'checkout-flow', name: 'Checkout Flow', description: 'Build checkout and payment processing flows. Use when taking payments.' })
    ];
    const discovery = new SkillDiscovery(source(skills));
    const ids = (await discovery.findRelevant('Build a checkout with payment processing for pricing plans')).map(s => s.id);
    expect(ids).toContain('checkout-flow');
    expect(ids).not.toContain('pricing-page');
    expect((await discovery.findRelevant('Design a SaaS pricing page')).some(s => s.id === 'pricing-page')).toBe(true);
  });

  it('anti-gaming: caps on keywords and tags, copied descriptions flagged', () => {
    const root = tempDir();
    const description = 'Spreadsheet automation for budgets and reports. Use when working with spreadsheets.';
    writeSkillFolder(path.join(root, 'general', 'one'), {
      data: { name: 'one', description, license: 'MIT', metadata: { 'luci-tags': Array.from({ length: 16 }, (_, i) => `t${i}`).join(', ') } },
      content: 'Body',
      contract: { lss: 1, keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }
    });
    writeSkillFolder(path.join(root, 'general', 'two'), { data: { name: 'two', description, license: 'MIT' }, content: 'Body', contract: { lss: 1 } });
    const one = lintSkillFolder(path.join(root, 'general', 'one'));
    expect(one.errors.some(e => e.includes('21 keywords'))).toBe(true);
    expect(one.errors.some(e => e.includes('16 tags'))).toBe(true);
    expect(lintLibrary(root).results.find(r => r.name === 'two')?.warnings.some(w => w.includes('Same description as one'))).toBe(true);
  });

  it('skills add previews grade the skill; below Findable is Incomplete', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'notes.md');
    fs.writeFileSync(file, '---\nname: orbit-notes\ndescription: Kepler orbit calculations and orbital elements reference.\nlicense: MIT\n---\nBody', 'utf8');
    const prepared = await prepareSkill(file);
    expect(previewSkill(prepared, { root: dir }).level).toBe(0);
    const withWhen = previewSkill(prepared, { root: dir, when: 'Use when computing satellite orbits' });
    expect(withWhen.level).toBe(1);
    expect(withWhen.name).toBe('orbit-notes');
  });
});

// Ported from the prototype: drafts.test.js
describe('drafts', () => {
  const makeSkill = (contract: Record<string, unknown> = { lss: 1 }) => {
    const dir = path.join(tempDir(), 'ui-ux', 'pricing-page');
    writeSkillFolder(dir, { data: { name: 'pricing-page', description: 'Design SaaS pricing pages with plan comparison tables and billing toggles.', license: 'MIT' }, content: '# Pricing', contract });
    return dir;
  };
  const asSkill = (dir: string) => {
    const { data, contract } = readSkillFolder(dir);
    return { id: String(data['name']), name: String(data['name']), description: String(data['description']), tags: [], contract };
  };

  it('fill only empty fields, within the caps, and are listed as drafts', () => {
    const dir = makeSkill({ lss: 1, whenToUse: ['Author wrote this'] });
    const drafted = addDrafts(dir, { whenToUse: ['Drafted, should be ignored'], keywords: ['subscription', 'plans table', 'x'.repeat(60), 'subscription'], whenNotToUse: ['Checkout and payment processing'] });
    expect([...drafted].sort()).toEqual(['keywords', 'whenNotToUse']);
    const { contract } = readSkillFolder(dir);
    expect(contract.whenToUse).toEqual(['Author wrote this']);
    expect(contract.keywords).toEqual(['subscription', 'plans table']);
    expect(contract.drafts).toEqual(['keywords', 'whenNotToUse']);
    expect(Object.keys(listDrafts(contract)).sort()).toEqual(['keywords', 'whenNotToUse']);
  });

  it('do not count until approved; approve keeps, reject deletes', () => {
    const dir = makeSkill({ lss: 1, summary: 's', whenToUse: ['Use when building pricing pages'], domains: ['design'] });
    addDrafts(dir, { keywords: ['subscription', 'plans', 'tiers'], whenNotToUse: ['Checkout flows'] });
    expect(rankabilityLevel(asSkill(dir)).level).toBe(1);
    expect(approveDrafts(dir, ['keywords'])).toEqual(['keywords']);
    expect(rankabilityLevel(asSkill(dir)).level).toBe(2);
    expect(readSkillFolder(dir).contract.drafts).toEqual(['whenNotToUse']);
    expect(rejectDrafts(dir)).toEqual(['whenNotToUse']);
    const { contract } = readSkillFolder(dir);
    expect(contract.whenNotToUse).toBeUndefined();
    expect(contract.drafts).toBeUndefined();
  });
});

// Ported from the prototype: skill-discovery.test.js and orchestrator.test.js (on Luci's library)
describe('selection on the shipped library', () => {
  const registry = new SkillRegistry({ autoIndex: false });

  it('keyword search ranks design-system skills for "design system"', async () => {
    const ids = (await new SkillDiscovery(registry).search('design system')).map(s => s.id);
    expect(ids.slice(0, 3).some(id => ['build-design-system', 'design-system-boss'].includes(id))).toBe(true);
  });

  it('framework filtering keeps only matching skills', async () => {
    const results = await new SkillDiscovery(registry).search('react', { framework: 'react' });
    expect(results.length).toBeGreaterThan(0);
    for (const s of results) expect(s.frameworks.some(f => ['any', 'react'].includes(f)), s.id).toBe(true);
  });

  it('a task gets skills, an order and full instructions under the Luci header', async () => {
    const orchestrator = new SkillOrchestrator(registry);
    const task = 'Build a responsive SaaS pricing page with a monthly and yearly toggle and smooth animations.';
    const recs = await orchestrator.recommend(task, { framework: 'react' });
    expect(recs.primarySkills.length).toBeGreaterThan(0);
    expect(recs.executionOrder.length).toBeGreaterThan(0);
    const loaded = await orchestrator.loadSkillsForTask(task, { framework: 'react' });
    expect(loaded.formattedInstructions).toContain('# LUCI — ACTIVE SKILL CONTEXT');
    expect(loaded.skills.length).toBeGreaterThan(0);
  });

  it('UI tasks point to the accessibility baseline without inlining it', async () => {
    const loaded = await new SkillOrchestrator(registry).loadSkillsForTask('Design a SaaS pricing page');
    expect(loaded.baseline?.id).toBe('accessibility-baseline');
    expect(loaded.skills.some(s => s.id === 'accessibility-baseline')).toBe(false);
  });

  it('a task outside the design focus loads nothing', async () => {
    const loaded = await new SkillOrchestrator(registry).loadSkillsForTask('Deploy a containerized app to Azure Kubernetes Service');
    expect(loaded.skills).toEqual([]);
    expect(loaded.formattedInstructions).toContain('No skills in the library closely match this task');
  });

  it('explicit skill names load exactly those skills', async () => {
    const loaded = await new SkillOrchestrator(registry).loadSkillsForTask('<landing-page>, <pricing-page>');
    expect(loaded.skills.map(s => s.id)).toEqual(['landing-page', 'pricing-page']);
  });
});

describe('regression: prototype gave agents empty skill bodies', () => {
  it('a selected skill with drafted keywords arrives with its full instructions', async () => {
    const root = tempDir();
    addSkill(root, 'ui-ux', 'pricing-page', 'Design SaaS pricing pages with plan comparison and billing toggles. Use when building pricing pages.',
      { lss: 1, keywords: ['subscription'], drafts: ['keywords'] }, '# Pricing\n\nThe real instructions.');
    const loaded = await new SkillOrchestrator(new SkillRegistry({ skillsDir: root, autoIndex: false })).loadSkillsForTask('Design a SaaS pricing page');
    expect(loaded.skills[0]?.id).toBe('pricing-page');
    expect(loaded.skills[0]?.mode).toBe('full');
    expect(loaded.skills[0]?.content).toContain('The real instructions.');
  });

  it('every skill loaded in full has a non-empty body (shipped library, benchmark tasks)', async () => {
    const orchestrator = new SkillOrchestrator(new SkillRegistry({ autoIndex: false }));
    for (const task of ['Design a SaaS pricing page with a monthly and yearly billing toggle', 'Build a design system with tokens and primitives', 'Scroll-triggered text reveal animation for headings', 'Theme and extend shadcn/ui components with Radix']) {
      for (const s of (await orchestrator.loadSkillsForTask(task)).skills) {
        if (s.mode === 'full') expect(s.content.length, `${task}: ${s.id}`).toBeGreaterThan(100);
      }
    }
  });

  it('the token budget still holds', async () => {
    const loaded = await new SkillOrchestrator(new SkillRegistry({ autoIndex: false })).loadSkillsForTask('Build a design system with tokens and primitives', {}, { tokenBudget: 3000 });
    const full = loaded.skills.filter(s => s.mode === 'full').reduce((n, s) => n + s.fullTokens, 0);
    expect(full).toBeLessThanOrEqual(3000);
    expect(loaded.skills.some(s => s.mode === 'summary')).toBe(true);
  });
});
