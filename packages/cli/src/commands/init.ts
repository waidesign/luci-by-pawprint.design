import { AGENT_FILES, AGENT_NAMES, PRODUCT, type AgentId } from '@luci-dev/format';
import { initProject } from '@luci-dev/brain';
import { SkillRegistry } from '@luci-dev/skills';
import { isHelp, parseFlags, type Command } from '../context.js';
import { createLineAsker, runOnboarding } from '../onboarding.js';
import { cliVersion } from '../version.js';
import { toolbarInstalledIn } from '../toolbarSetup.js';
import { offerToolbar, toolbarCommand } from './toolbar.js';

export const INIT_FLAGS = ['--dry-run', '--force', '--yes', '--non-interactive', '-i', '--interactive', '--toolbar'] as const;

export const INIT_HELP = `init [--dry-run] [--force] [--yes | -i] [--agents <list>] [--toolbar]
                        Set up this project: ${PRODUCT.projectDir}/, your Global Brain, starter skills and the
                        agent files. In a terminal it asks for the goal, matching skills, packs and rules,
                        and offers to add the dev toolbar to your app (--toolbar adds it without asking).
                        Agent files: Claude Code and Cursor, any agent whose file the project has, and
                        --agents codex,gemini,copilot,generic (or all).`;

/** "--agents codex,gemini" or "--agents=all": the agents asked for, or an error. */
export function parseAgents(args: readonly string[]): { args: string[]; agents: AgentId[]; error?: string } {
  const rest: string[] = [];
  const agents: AgentId[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    let list: string | undefined;
    if (arg === '--agents') list = args[++i];
    else if (arg.startsWith('--agents=')) list = arg.slice('--agents='.length);
    else { rest.push(arg); continue; }
    if (!list) return { args: rest, agents, error: `--agents needs a list: ${Object.keys(AGENT_NAMES).filter(n => !n.includes('-')).join(', ')} or all` };
    for (const name of list.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
      if (name === 'all') agents.push(...(Object.keys(AGENT_FILES) as AgentId[]));
      else if (AGENT_NAMES[name]) agents.push(AGENT_NAMES[name]!);
      else return { args: rest, agents, error: `Unknown agent "${name}". Known: ${Object.keys(AGENT_NAMES).filter(n => !n.includes('-')).join(', ')}, all` };
    }
  }
  return { args: rest, agents: [...new Set(agents)] };
}

export const initCommand: Command = async (rawArgs, ctx) => {
  if (isHelp(rawArgs)) {
    ctx.out(`Usage: ${PRODUCT.command} ${INIT_HELP}`);
    return 0;
  }
  const parsedAgents = parseAgents(rawArgs);
  if (parsedAgents.error) {
    ctx.err(parsedAgents.error);
    return 1;
  }
  const args = parsedAgents.args;
  const { flags, unknown, rest } = parseFlags(args, INIT_FLAGS);
  if (unknown.length || rest.length) {
    ctx.err(`Unknown option for init: ${[...unknown, ...rest].join(' ')}`);
    ctx.err(`Usage: ${PRODUCT.command} ${INIT_HELP}`);
    return 1;
  }
  const dryRun = flags.has('--dry-run');
  const interactive = flags.has('-i') || flags.has('--interactive')
    || (ctx.isTTY && !flags.has('--yes') && !flags.has('--non-interactive'));

  const registry = new SkillRegistry({ user: true });
  const report = await initProject(ctx.cwd, { dryRun, force: flags.has('--force'), version: cliVersion(), registry, agents: parsedAgents.agents });
  const info = report.projectInfo;

  ctx.out(`${PRODUCT.name} init${dryRun ? ' (dry run: nothing is written)' : ''}: ${report.projectPath}`);
  ctx.out(`Project:      ${info.projectName} (${info.framework === 'unknown' ? 'framework not detected' : info.framework}${info.packages.length ? ` of ${info.packages.length} packages` : ''}; ${info.languages.join(', ') || 'no language detected'}; ${info.packageManager})`);
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

  if (interactive) {
    const asker = ctx.ask ? null : createLineAsker();
    try {
      await runOnboarding({ projectDir: report.projectPath, ask: ctx.ask ?? asker!.ask, registry, log: ctx.out });
    } finally {
      asker?.close();
    }
  } else if (report.packsSuggested.length) {
    // Onboarding offers packs itself; without it, list them so nothing is added silently
    ctx.out('\nSkill packs that fit this project (nothing added yet):');
    for (const p of report.packsSuggested) {
      ctx.out(`  * ${p.name}: ${p.title} (${p.skills.join(', ')})`);
      ctx.out(`    Why: ${p.reasons.join('; ')}`);
    }
    ctx.out(`  Add with: ${PRODUCT.command} packs add ${report.packsSuggested.map(p => p.name).join(' ')}`);
  }

  // The design baseline (B14): what init read from the project's stylesheets
  if (report.baseline) {
    ctx.out(`\nDesign baseline: ${report.baseline.files.length} file${report.baseline.files.length === 1 ? '' : 's'} from ${report.baseline.stylesheets} stylesheet${report.baseline.stylesheets === 1 ? '' : 's'} and ${report.baseline.tokens} token${report.baseline.tokens === 1 ? '' : 's'}: your project's own typography, colors and spacing, for your agent to reuse. Rebuild with ${PRODUCT.command} capture baseline.`);
  }

  // The dev toolbar: added on request, offered in a terminal, else one line on how to add it later
  if (flags.has('--toolbar')) await toolbarCommand([], ctx);
  else if (interactive) await offerToolbar(ctx);
  else if (!toolbarInstalledIn(ctx.cwd)) ctx.out(`\nDev toolbar (notes, layout plans and captures in your running app): ${PRODUCT.command} toolbar`);

  const files = (Object.keys(report.agents) as AgentId[]).map(id => AGENT_FILES[id]);
  ctx.out(`\nDone. Your agents read ${PRODUCT.projectDir}/ through ${files.slice(0, -1).join(', ')}${files.length > 1 ? ' and ' : ''}${files[files.length - 1]}.`);
  ctx.out(`Other agents: ${PRODUCT.command} init --agents codex,gemini,copilot,generic (or all).`);
  ctx.out(`Check the setup any time with: ${PRODUCT.command} doctor`);
  return 0;
};
