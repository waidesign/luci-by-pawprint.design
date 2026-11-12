import { PRODUCT } from '@luci/format';
import { PROTOTYPE, importPrototype } from '@luci/brain';
import { parseFlags, type Command } from '../context.js';
import { cliVersion } from '../version.js';

export const IMPORT_HELP = `import [--dry-run]    Move a project from the earlier prototype (${PROTOTYPE.projectDir}/) onto ${PRODUCT.name}`;

export const importCommand: Command = async (args, ctx) => {
  const { flags, unknown, rest } = parseFlags(args, ['--dry-run']);
  if (unknown.length || rest.length) {
    ctx.err(`Unknown option: ${[...unknown, ...rest].join(' ')}\nUsage: ${PRODUCT.command} ${IMPORT_HELP}`);
    return 1;
  }
  const dryRun = flags.has('--dry-run');
  const version = cliVersion();
  const report = await importPrototype(ctx.cwd, { dryRun, ...(version ? { version } : {}) });
  if (report.blocked) {
    ctx.err(report.blocked);
    return 1;
  }

  ctx.out(`${PRODUCT.name} import${dryRun ? ' (dry run, nothing written)' : ''}: ${PROTOTYPE.projectDir}/ -> ${PRODUCT.projectDir}/ in ${report.projectPath}`);
  ctx.out(`\nMemory files merged into ${PRODUCT.name}'s templates:`);
  for (const m of report.merged) ctx.out(`  ${m.file}${m.kept.length ? `  (kept your sections: ${m.kept.join(', ')})` : '  (template text only)'}`);
  if (report.copied.length) ctx.out(`\nCopied as they were: ${report.copied.length} files (decisions, proposals, notes, the active task)`);
  if (report.skills.kept.length) ctx.out(`Project skills converted: ${report.skills.kept.join(', ')}`);
  if (report.skills.replacedByLuci.length) ctx.out(`Starter skills nobody changed, now ${PRODUCT.name}'s copies: ${report.skills.replacedByLuci.join(', ')}`);
  ctx.out(`Selected library skills carried over: ${report.lock.skills}${report.lock.notInLibrary.length ? ` (${report.lock.notInLibrary.length} not in ${PRODUCT.name}'s library)` : ''}`);
  if (report.globalBrain.from) {
    ctx.out(`\nGlobal Brain from ${report.globalBrain.from}:`);
    ctx.out(`  ${report.globalBrain.copied.length ? `carried over: ${report.globalBrain.copied.join(', ')}` : 'nothing new to carry over'}`);
    if (report.globalBrain.keptYours.length) ctx.out(`  kept yours (you already changed them in ~/${PRODUCT.homeDir}/brain): ${report.globalBrain.keptYours.join(', ')}`);
  }
  ctx.out('\nAgent files:');
  for (const a of report.agentFiles) ctx.out(`  ${a.file}: ${a.action}`);
  ctx.out('\nNext:');
  for (const n of report.next) ctx.out(`  - ${n}`);
  if (dryRun) ctx.out(`\nRun \`${PRODUCT.command} import\` without --dry-run to write this.`);
  return 0;
};
