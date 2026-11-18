import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diagnose, initProject } from '@luci-dev/brain';
import { readLock, writeSkillFolder } from '@luci-dev/skills';
import { run } from '../src/index.js';
import { fakeContext, readMemory, tempDir, tempProject } from './helpers.js';

const project = async () => {
  const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shop', dependencies: { react: '^18' }, devDependencies: { vite: '^5' } }) });
  await initProject(dir);
  return dir;
};
const luci = async (dir: string, ...args: string[]) => {
  const f = fakeContext(dir);
  const code = await run(args, f.ctx);
  return { code, out: f.text(), err: f.errors() };
};
/** A skill folder somewhere outside the project, to add from. */
const sourceSkill = (name: string, extra: { scripts?: boolean; description?: string } = {}) => {
  const dir = path.join(tempDir('luci-src-'), name);
  writeSkillFolder(dir, {
    data: { name, description: extra.description ?? `Write release notes in my team style for ${name}. Use when drafting release notes.`, license: 'MIT' },
    content: `# ${name}\n\nSteps.`,
    contract: { lss: 1 }
  });
  if (extra.scripts) {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts', 'run.sh'), 'echo hi\n', 'utf8');
  }
  return dir;
};

describe('luci skills: find and load (S2, S4)', () => {
  it('lists the library by category and filters one category', async () => {
    const dir = await project();
    const all = await luci(dir, 'skills');
    expect(all.code).toBe(0);
    expect(all.out).toMatch(/\d+ skills:/);
    expect(all.out).toContain('design-systems');
    const one = await luci(dir, 'skills', 'design-systems');
    expect(one.out).toContain('build-design-system');
    expect(one.out).not.toContain('tdd ');
  });

  it('search explains each match', async () => {
    const r = await luci(await project(), 'skills', 'search', 'pricing page');
    expect(r.out).toContain('pricing-page');
    expect(r.out).toContain('Matched');
  });

  it('recommend gives a reason per skill, and nothing for an unrelated task', async () => {
    const dir = await project();
    expect((await luci(dir, 'skills', 'recommend', 'Design a SaaS pricing page')).out).toMatch(/pricing-page\s+\[official\] Matched/);
    expect((await luci(dir, 'skills', 'recommend', 'Flight control software for a drone')).out).toContain('none is recommended');
  });

  it('use lists the matching skills with files and reasons; --full prints the instructions', async () => {
    const dir = await project();
    const r = await luci(dir, 'skills', 'use', 'Design a SaaS pricing page');
    expect(r.out).toContain('pricing-page  [official]  full');
    expect(r.out).toContain('Why: Matched');
    expect(r.out).toContain('For every UI change: accessibility-baseline');
    const full = await luci(dir, 'skills', 'use', 'Design a SaaS pricing page', '--full');
    expect(full.out).toContain('# LUCI — ACTIVE SKILL CONTEXT');
    expect((await luci(dir, 'skills', 'use', 'Simulate orbital mechanics')).out).toContain('none is loaded');
    expect((await luci(dir, 'skills', 'use', 'x', '--budget', 'lots')).code).toBe(1);
  });

  it('use --project loads only the project\'s skills', async () => {
    const dir = await project();
    expect((await luci(dir, 'skills', 'use', 'Design a SaaS pricing page', '--project')).out).toContain('No skill in this project');
    await luci(dir, 'skills', 'select', 'pricing-page');
    expect((await luci(dir, 'skills', 'use', 'Design a SaaS pricing page', '--project')).out).toContain('pricing-page');
  });
});

describe('luci skills: manage (S5)', () => {
  it('select, selected and deselect keep the lockfile and catalog in step', async () => {
    const dir = await project();
    const sel = await luci(dir, 'skills', 'select', 'pricing-page', 'not-a-skill', '--reason', 'Plans page');
    expect(sel.code).toBe(1);
    expect(sel.out).toContain('Selected for this project: pricing-page');
    expect(sel.err).toContain('Not found: not-a-skill');
    expect(readLock(dir).skills[0]).toMatchObject({ id: 'pricing-page', reason: 'Plans page' });
    expect(readMemory(dir, 'project-skills.md')).toContain('(`pricing-page`)');
    expect((await luci(dir, 'skills', 'selected')).out).toMatch(/pricing-page\s+\[official\] Plans page/);
    expect((await luci(dir, 'skills', 'selected')).out).toContain('[project]');
    expect((await luci(dir, 'skills', 'deselect', 'pricing-page')).out).toContain('No longer used');
    expect(readMemory(dir, 'project-skills.md')).not.toContain('(`pricing-page`)');
  });

  it('project commands outside a project say to run init', async () => {
    const r = await luci(tempProject(), 'skills', 'select', 'tdd');
    expect(r.code).toBe(1);
    expect(r.err).toContain('luci init');
  });

  it('add puts a skill in the personal library; mine lists it; share copies it into the project', async () => {
    const dir = await project();
    const added = await luci(dir, 'skills', 'add', sourceSkill('team-notes'));
    expect(added.code, added.err).toBe(0);
    expect(added.out).toContain('to your personal library');
    expect(fs.existsSync(path.join(process.env['LUCI_HOME'] ?? '', 'skills', 'general', 'team-notes', 'luci.json'))).toBe(true);
    expect((await luci(dir, 'skills', 'mine')).out).toContain('team-notes');
    expect((await luci(dir, 'skills', 'add', sourceSkill('team-notes'))).code).toBe(1);

    const shared = await luci(dir, 'skills', 'share', 'team-notes');
    expect(shared.code).toBe(0);
    expect(fs.existsSync(path.join(dir, '.luci', 'skills', 'team-notes', 'SKILL.md'))).toBe(true);
    expect(readMemory(dir, 'project-skills.md')).toContain('(`team-notes`)');
  });

  it('add --project writes into .luci/skills', async () => {
    const dir = await project();
    expect((await luci(dir, 'skills', 'add', sourceSkill('house-style'), '--project')).code).toBe(0);
    expect(fs.existsSync(path.join(dir, '.luci', 'skills', 'house-style', 'SKILL.md'))).toBe(true);
  });

  it('a skill that can run commands needs an explicit yes', async () => {
    const dir = await project();
    const src = sourceSkill('deployer', { scripts: true, description: 'Deploy with a script. Use when deploying.' });
    const refused = await luci(dir, 'skills', 'add', src);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain('--yes');
    expect((await luci(dir, 'skills', 'add', src, '--yes')).code).toBe(0);
  });

  it('lint checks the project skills and shows levels', async () => {
    const dir = await project();
    const r = await luci(dir, 'skills', 'lint', '--levels');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Checked 5 skills');
    expect(r.out).toContain('Levels:');
  });

  it('pin, block and prefs', async () => {
    const dir = await project();
    expect((await luci(dir, 'skills', 'pin', 'tdd')).out).toContain('Pinned: tdd');
    expect((await luci(dir, 'skills', 'block', 'tdd')).out).toContain('Blocked: tdd');
    const prefs = (await luci(dir, 'skills', 'prefs')).out;
    expect(prefs).toContain('Blocked: tdd');
    expect(prefs).toContain('Pinned:  (none)');
    expect((await luci(dir, 'skills', 'pin', 'nope')).code).toBe(1);
    await luci(dir, 'skills', 'unblock', 'tdd');
  });
});

describe('luci skills: drafts and licences (S9, S10)', () => {
  it('review lists drafted fields and approves them', async () => {
    const dir = await project();
    const src = sourceSkill('drafted-notes');
    const contractFile = path.join(src, 'luci.json');
    fs.writeFileSync(contractFile, JSON.stringify({ lss: 1, keywords: ['changelog'], drafts: ['keywords'] }), 'utf8');
    await luci(dir, 'skills', 'add', src);
    const listed = await luci(dir, 'skills', 'review');
    expect(listed.out).toContain('drafted-notes');
    expect(listed.out).toContain('keywords: ["changelog"]');
    expect((await luci(dir, 'skills', 'review', 'drafted-notes', '--approve')).out).toContain('Approved for drafted-notes: keywords');
    expect((await luci(dir, 'skills', 'review')).out).toContain('No drafted fields');
    expect((await luci(dir, 'skills', 'review', 'pricing-page', '--approve')).code).toBe(1);
  });

  it('licenses touches the network only when there is something to check', async () => {
    const r = await luci(await project(), 'skills', 'licenses');
    expect(r.out).toContain('No personal skills with a GitHub source');
  });
});

describe('luci packs (S8)', () => {
  it('show, add and remove', async () => {
    const dir = await project();
    const shown = (await luci(dir, 'packs')).out;
    expect(shown).toContain('[fits]  ui: UI basics');
    expect(shown).toContain('react-best-practices');
    expect((await luci(dir, 'packs', 'add', 'ui')).out).toContain('ui: added');
    expect((await luci(dir, 'packs')).out).toContain('[added] ui');
    expect(readMemory(dir, 'project-skills.md')).toContain('(`accessibility-baseline`)');
    expect((await luci(dir, 'packs', 'remove', 'ui')).out).toContain('ui: removed');
    expect((await luci(dir, 'packs', 'add', 'nope')).code).toBe(1);
  });
});

describe('luci doctor and skills', () => {
  it('reports selected skills this machine lacks, with the fix', async () => {
    const dir = await project();
    await luci(dir, 'skills', 'select', 'tdd');
    fs.writeFileSync(path.join(dir, '.luci', 'skills.lock.json'), JSON.stringify({ lss: 1, skills: [...readLock(dir).skills, { id: 'gone-skill' }] }), 'utf8');
    const check = (await diagnose(dir)).checks.find(c => c.label === 'Skill selection');
    expect(check).toMatchObject({ status: 'warn', fix: expect.stringContaining('skills deselect') });
    expect(check?.detail).toContain('gone-skill');
  });

  it('a fresh project counts its starter skills', async () => {
    const result = await diagnose(await project());
    expect(result.checks.find(c => c.label === 'Skills')).toMatchObject({ status: 'ok', detail: '0 from the library, 5 project skills' });
    expect(result.project?.skills).toBe(5);
  });
});
