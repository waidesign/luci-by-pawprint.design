import fs from 'node:fs';
import { PRODUCT } from '@luci-dev/format';
import { detectProject, findProjectRoot, memoryDir, readProjectGoal } from '@luci-dev/brain';
import { SkillRegistry, addPack, addedPacks, loadPacks, packReasons, packSkills, removePack, writeCatalog } from '@luci-dev/skills';
import { isHelp, subcommandHelp, type Command } from '../context.js';

export const PACKS_HELP = `packs [show]          Curated skill sets (ui, motion, marketing, design-system, design-system-build):
                        which fit this project and why, and the skills each would add
  packs add <name...>           Add packs to this project
  packs remove <name...>        Remove packs; skills another pack or a person chose stay`;

export const packsCommand: Command = async (args, ctx) => {
  if (isHelp(args)) {
    const sub = args.find(a => !a.startsWith('-'));
    ctx.out(`Usage: ${PRODUCT.command} ${subcommandHelp(PACKS_HELP, 'packs', sub)}`);
    return 0;
  }
  const [sub = 'show', ...names] = args;
  const root = findProjectRoot(ctx.cwd).root;
  if (!fs.existsSync(memoryDir(root))) {
    ctx.err(`No ${PRODUCT.projectDir}/ here. Run \`${PRODUCT.command} init\` first.`);
    return 1;
  }
  const registry = new SkillRegistry({ user: true });
  const info = detectProject(root);
  const goal = readProjectGoal(root) ?? '';
  const packs = loadPacks();
  const byName = new Map(packs.map(p => [p.name, p]));

  if (sub === 'show') {
    const added = new Set(addedPacks(root));
    for (const pack of packs) {
      const reasons = packReasons(pack, info, { projectDir: root, goal });
      const { skills } = await packSkills(pack, info, registry);
      ctx.out(`${added.has(pack.name) ? '[added] ' : reasons.length ? '[fits]  ' : '        '}${pack.name}: ${pack.title}`);
      ctx.out(`        ${pack.description}`);
      if (reasons.length) ctx.out(`        Why it fits: ${reasons.join('; ')}`);
      ctx.out(`        Skills here: ${skills.map(s => s.id).join(', ') || '(none for this project)'}`);
    }
    ctx.out(`\nAdd with: ${PRODUCT.command} packs add <name...>`);
    return 0;
  }

  if (sub !== 'add' && sub !== 'remove') {
    ctx.err(`Unknown packs command: ${sub}\nUsage: ${PRODUCT.command} ${PACKS_HELP}`);
    return 1;
  }
  const unknown = names.filter(n => !byName.has(n));
  if (!names.length || unknown.length) {
    ctx.err(`${unknown.length ? `Unknown pack(s): ${unknown.join(', ')}. ` : ''}Packs: ${[...byName.keys()].join(', ')}`);
    return 1;
  }
  for (const name of names) {
    if (sub === 'add') {
      const r = await addPack(root, registry, byName.get(name)!, info);
      ctx.out(`${name}: added ${r.added.join(', ') || 'nothing new'}${r.tagged.length ? `; also tagged ${r.tagged.join(', ')}` : ''}${r.already.length ? `; already chosen: ${r.already.join(', ')}` : ''}`);
      if (r.missing.length) ctx.err(`  not in the library: ${r.missing.join(', ')}`);
    } else {
      const r = removePack(root, name);
      ctx.out(`${name}: removed ${r.removed.join(', ') || 'nothing'}${r.kept.length ? `; kept (another pack uses them): ${r.kept.join(', ')}` : ''}`);
    }
  }
  await writeCatalog(root, registry);
  return 0;
};
