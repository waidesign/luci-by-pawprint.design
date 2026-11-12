import { MEMORY_FILES, PRODUCT } from '@luci/format';
import { intakeDocs, memoryPath } from '@luci/brain';
import type { Command } from '../context.js';

export const INTAKE_HELP = `intake <file...>      Fit a PRD and supporting docs into project memory (--dry-run to preview)`;

export const intakeCommand: Command = async (args, ctx) => {
  const dryRun = args.includes('--dry-run');
  const files = args.filter(a => !a.startsWith('--'));
  const unknown = args.filter(a => a.startsWith('--') && a !== '--dry-run');
  if (!files.length || unknown.length) {
    ctx.err(`${unknown.length ? `Unknown option: ${unknown.join(' ')}\n` : ''}Usage: ${PRODUCT.command} ${INTAKE_HELP}`);
    return 1;
  }
  const report = intakeDocs(ctx.cwd, files, { dryRun });
  if (!report.initialized) {
    ctx.err(`No ${PRODUCT.projectDir}/ here. Run \`${PRODUCT.command} init\` first.`);
    return 1;
  }
  for (const e of report.errors) ctx.err(`Skipped ${e}`);
  if (!report.docs.length) return 1;

  ctx.out(`${PRODUCT.name} intake${dryRun ? ' (dry run, nothing written)' : ''}: ${report.docs.map(d => `${d.source} (${d.sections} sections)`).join(', ')}`);
  if (report.filled.length) {
    ctx.out(`\n${dryRun ? 'Would fill' : 'Filled'} (these sections were still empty):`);
    for (const f of report.filled) ctx.out(`  ${f.section}  <- ${f.source}`);
  }
  if (report.proposals.length) {
    ctx.out(`\n${dryRun ? 'Would propose' : 'Proposed'} for your review, in ${memoryPath(`${MEMORY_FILES.proposedMemory}/`)}:`);
    for (const p of report.proposals) ctx.out(`  ${p.topic.padEnd(48)} -> ${p.belongsIn}`);
  } else {
    ctx.out('\nNothing new to propose: the same proposals are already waiting for review.');
  }
  ctx.out(`\nNothing you wrote was replaced. Move each proposal into the file it names, or delete it.`);
  if (dryRun) ctx.out(`Run it without --dry-run to write these.`);
  return 0;
};
