import { PRODUCT } from '@luci-dev/format';
import { CAPTURE_HELP, captureCommand } from './commands/capture.js';
import { DOCTOR_HELP, doctorCommand } from './commands/doctor.js';
import { INIT_HELP, initCommand } from './commands/init.js';
import { IMPORT_HELP, importCommand } from './commands/import.js';
import { INTAKE_HELP, intakeCommand } from './commands/intake.js';
import { MAP_HELP, mapCommand } from './commands/map.js';
import { PACKS_HELP, packsCommand } from './commands/packs.js';
import { SERVE_HELP, serveCommand } from './commands/serve.js';
import { SKILLS_HELP, skillsCommand } from './commands/skills.js';
import { TOOLBAR_HELP, toolbarCommand } from './commands/toolbar.js';
import { TASK_HELP, taskCommand } from './commands/task.js';
import { START_HELP, UPDATE_HELP, startCommand, updateCommand } from './commands/startUpdate.js';
import { BENCHMARK_HELP, benchmarkCommand } from './commands/benchmark.js';
import type { CliContext, Command } from './context.js';
import { cliVersion } from './version.js';

const versionCommand: Command = async (_args, ctx) => {
  ctx.out(`${PRODUCT.command} ${cliVersion() || '(unknown version)'}`);
  return 0;
};

const helpCommand: Command = async (_args, ctx) => {
  ctx.out(`${PRODUCT.name}: memory, skills, design capture and feedback for AI coding agents. Everything stays on your machine.`);
  ctx.out(`\nUsage: ${PRODUCT.command} <command> [options]\n`);
  ctx.out('Commands:');
  ctx.out(`  ${INIT_HELP}`);
  ctx.out(`  ${START_HELP}`);
  ctx.out(`  ${UPDATE_HELP}`);
  ctx.out(`  ${DOCTOR_HELP}`);
  ctx.out(`  ${SKILLS_HELP}`);
  ctx.out(`  ${PACKS_HELP}`);
  ctx.out(`  ${TASK_HELP}`);
  ctx.out(`  ${INTAKE_HELP}`);
  ctx.out(`  ${MAP_HELP}`);
  ctx.out(`  ${SERVE_HELP}`);
  ctx.out(`  ${TOOLBAR_HELP}`);
  ctx.out(`  ${CAPTURE_HELP}`);
  ctx.out(`  ${IMPORT_HELP}`);
  ctx.out(`  ${BENCHMARK_HELP}`);
  ctx.out('  version               Show the version');
  ctx.out('  help                  Show this help');
  return 0;
};

export const COMMANDS: Readonly<Record<string, Command>> = {
  init: initCommand,
  doctor: doctorCommand,
  skills: skillsCommand,
  packs: packsCommand,
  pack: packsCommand,
  task: taskCommand,
  intake: intakeCommand,
  map: mapCommand,
  serve: serveCommand,
  toolbar: toolbarCommand,
  capture: captureCommand,
  captures: captureCommand,
  import: importCommand,
  benchmark: benchmarkCommand,
  eval: benchmarkCommand,
  start: startCommand,
  update: updateCommand,
  version: versionCommand,
  '--version': versionCommand,
  '-v': versionCommand,
  help: helpCommand,
  '--help': helpCommand,
  '-h': helpCommand
};

/** Run one command line. Returns the process exit code. */
export async function run(args: readonly string[], ctx: CliContext): Promise<number> {
  const [name = 'help', ...rest] = args;
  const command = COMMANDS[name];
  if (!command) {
    ctx.err(`Unknown command: ${name}\n`);
    await helpCommand([], { ...ctx, out: ctx.err });
    return 1;
  }
  try {
    return await command(rest, ctx);
  } catch (err) {
    ctx.err(`${PRODUCT.command} ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
