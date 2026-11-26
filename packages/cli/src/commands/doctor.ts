import { PRODUCT } from '@luci-dev/format';
import { diagnose, type Check, type CheckStatus } from '@luci-dev/brain';
import { isHelp, parseFlags, type Command } from '../context.js';

export const DOCTOR_HELP = `doctor [--json]       Check the install and this project's setup, and say how to fix what is wrong`;

const MARK: Readonly<Record<CheckStatus, string>> = { ok: '[ok]  ', info: '[info]', warn: '[warn]', fail: '[fail]' };

export const doctorCommand: Command = async (args, ctx) => {
  if (isHelp(args)) {
    ctx.out(`Usage: ${PRODUCT.command} ${DOCTOR_HELP}`);
    return 0;
  }
  const { flags, unknown, rest } = parseFlags(args, ['--json']);
  if (unknown.length || rest.length) {
    ctx.err(`Unknown option for doctor: ${[...unknown, ...rest].join(' ')}`);
    ctx.err(`Usage: ${PRODUCT.command} ${DOCTOR_HELP}`);
    return 1;
  }

  const result = await diagnose(ctx.cwd, {
    ...(ctx.pathEnv !== undefined ? { pathEnv: ctx.pathEnv } : {}),
    ...(ctx.platform !== undefined ? { platform: ctx.platform } : {})
  });
  if (flags.has('--json')) {
    ctx.out(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  const print = (title: string, checks: readonly Check[]) => {
    ctx.out(`\n${title}`);
    for (const c of checks) {
      ctx.out(`  ${MARK[c.status]} ${c.label}${c.detail ? `: ${c.detail}` : ''}`);
      if (c.fix && c.status !== 'ok') ctx.out(`         Fix: ${c.fix}`);
    }
  };

  ctx.out(`${PRODUCT.name} doctor: ${ctx.cwd}`);
  print('Install', result.checks.filter(c => c.area === 'install'));
  print('Project', result.checks.filter(c => c.area === 'project'));

  const p = result.project;
  if (p) {
    ctx.out('\nContext agents get');
    ctx.out(`  Project:      ${p.name} (${p.framework})`);
    if (p.activePackage) {
      ctx.out(`  Package:      ${p.activePackage.path} (${p.activePackage.name}) — ${p.activePackage.kind}, ${p.activePackage.framework}`);
    }
    ctx.out(`  Goal:         ${p.goal ? p.goal.split('\n')[0] : '(not written yet)'}`);
    ctx.out(`  Own rules:    ${p.projectRules}`);
    if (p.activePackage?.rules?.length) {
      ctx.out(`  Package rules:${p.activePackage.rules.length}`);
    } else if (p.packageRules) {
      ctx.out(`  Package rules:${p.packageRules}`);
    }
    ctx.out(`  Skills:       ${p.skills} (listed in ${PRODUCT.projectDir}/project-skills.md)`);
    ctx.out(`  Active task:  ${p.activeTask ? `${p.activeTask.task ?? '(untitled)'}${p.activeTask.started ? `, since ${p.activeTask.started}` : ''}` : '(none)'}`);
    ctx.out(`  Code map:     ${p.hasCodeMap ? 'graphify-out/graph.json' : '(not built)'}`);
  }

  const fails = result.checks.filter(c => c.status === 'fail').length;
  const warns = result.checks.filter(c => c.status === 'warn').length;
  ctx.out(`\n${fails ? `${fails} problem${fails > 1 ? 's' : ''} to fix` : 'No problems'}${warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}.`);
  return result.ok ? 0 : 1;
};
