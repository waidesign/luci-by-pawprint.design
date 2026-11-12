import { AGENT_FILES, PRODUCT } from '@luci/format';
import { initProject } from '@luci/brain';
import { parseFlags, type Command } from '../context.js';
import { createLineAsker, runOnboarding } from '../onboarding.js';
import { cliVersion } from '../version.js';

export const INIT_FLAGS = ['--dry-run', '--force', '--yes', '--non-interactive', '-i', '--interactive'] as const;

export const INIT_HELP = `init [--dry-run] [--force] [--yes | -i]
                        Set up this project: ${PRODUCT.projectDir}/, your Global Brain and the agent files.
                        Asks for the project goal and rules when run in a terminal (--yes skips the questions).`;

export const initCommand: Command = async (args, ctx) => {
  const { flags, unknown, rest } = parseFlags(args, INIT_FLAGS);
  if (unknown.length || rest.length) {
    ctx.err(`Unknown option for init: ${[...unknown, ...rest].join(' ')}`);
    ctx.err(`Usage: ${PRODUCT.command} ${INIT_HELP}`);
    return 1;
  }
  const dryRun = flags.has('--dry-run');
  const interactive = flags.has('-i') || flags.has('--interactive')
    || (ctx.isTTY && !flags.has('--yes') && !flags.has('--non-interactive'));

  const report = initProject(ctx.cwd, { dryRun, force: flags.has('--force'), version: cliVersion() });
  const info = report.projectInfo;

  ctx.out(`${PRODUCT.name} init${dryRun ? ' (dry run: nothing is written)' : ''}: ${report.projectPath}`);
  ctx.out(`Project:      ${info.projectName} (${info.framework === 'unknown' ? 'framework not detected' : info.framework}; ${info.languages.join(', ') || 'no language detected'}; ${info.packageManager})`);
  ctx.out(`Global Brain: ${report.globalBrainDir}`);

  const section = (title: string, items: readonly string[], mark: string) => {
    if (!items.length) return;
    ctx.out(`\n${title}:`);
    for (const item of items) ctx.out(`  ${mark} ${item}`);
  };
  section(dryRun ? 'Would create' : 'Created', report.created, '+');
  section(dryRun ? 'Would update' : 'Updated', report.updated, '~');
  section('Kept as they are', report.skipped, '=');
  section('Warnings', report.warnings, '!');

  if (dryRun) return 0;

  const agentFiles = Object.values(AGENT_FILES).join(' and ');
  if (interactive) {
    const asker = ctx.ask ? null : createLineAsker();
    try {
      await runOnboarding({ projectDir: report.projectPath, ask: ctx.ask ?? asker!.ask, log: ctx.out });
    } finally {
      asker?.close();
    }
  }
  ctx.out(`\nDone. Your agents read ${PRODUCT.projectDir}/ through ${agentFiles}.`);
  ctx.out(`Check the setup any time with: ${PRODUCT.command} doctor`);
  return 0;
};
