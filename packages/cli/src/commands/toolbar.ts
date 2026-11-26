import { PRODUCT } from '@luci-dev/format';
import { isHelp, type CliContext, type Command } from '../context.js';
import { createLineAsker } from '../onboarding.js';
import { DEFAULT_PORT } from '../serve/bridge.js';
import { addToolbar, findToolbarTarget, manualToolbarHelp, removeToolbar, toolbarInstalledIn } from '../toolbarSetup.js';

export const TOOLBAR_HELP = `toolbar [remove] [--port <n>] [--storybook] [--dry-run]
                        Add the dev toolbar to your app (its root HTML, layout, or .storybook/preview-body.html), or take it out again.
                        It only loads on this machine, while \`${PRODUCT.command} serve\` runs.`;

/** Yes unless the answer starts with "n", or is null/undefined (EOF). Empty string (Enter) is yes. */
const yes = (answer: string | null | undefined) => {
  if (answer === null || answer === undefined) return false;
  return !/^\s*n/i.test(answer);
};

/** Ask once whether to add the toolbar, then add it. Used by `init` and `serve` (the second chance). */
export async function offerToolbar(ctx: CliContext, port: number = DEFAULT_PORT): Promise<void> {
  if (toolbarInstalledIn(ctx.cwd)) return;
  const target = findToolbarTarget(ctx.cwd);
  if (!target) {
    ctx.out(`\nDev toolbar: no app root file here (index.html or a root layout). In your app's folder: ${PRODUCT.command} toolbar`);
    return;
  }
  const asker = ctx.ask ? null : createLineAsker();
  let answer: string;
  try {
    answer = await (ctx.ask ?? asker!.ask)(`\nAdd ${PRODUCT.name}'s dev toolbar to your app (${target.rel})? It only loads on this machine. [Y/n] `);
  } finally {
    asker?.close();
  }
  if (!yes(answer)) {
    ctx.out(`Not added. Any time later: ${PRODUCT.command} toolbar`);
    return;
  }
  report(ctx, addToolbar(ctx.cwd, { port }), port);
}

function report(ctx: CliContext, result: ReturnType<typeof addToolbar>, port: number): void {
  if (result.status === 'not-found') {
    ctx.out(`${PRODUCT.name} found no root HTML or layout here. Run this in your app's folder, or:`);
    for (const line of manualToolbarHelp(port)) ctx.out(`  ${line}`);
    return;
  }
  if (result.status === 'already') {
    ctx.out(`The dev toolbar is already in ${result.target.rel}.`);
    return;
  }
  if (result.status === 'updated') {
    ctx.out(`Updated the dev toolbar in ${result.target.rel} (${result.target.what}).`);
    return;
  }
  ctx.out(`Added the dev toolbar to ${result.target.rel} (${result.target.what}), between "luci:toolbar" comments:`);
  for (const l of result.lines) ctx.out(`  ${l}`);
  ctx.out(`Now run \`${PRODUCT.command} serve\` and open your app on this machine: Luci's button is in the bottom corner.`);
  ctx.out(`Take it out any time: ${PRODUCT.command} toolbar remove`);
}

export const toolbarCommand: Command = async (args, ctx) => {
  if (isHelp(args)) {
    ctx.out(`Usage: ${PRODUCT.command} ${TOOLBAR_HELP}`);
    return 0;
  }
  let port = DEFAULT_PORT;
  let dryRun = false;
  let storybook = false;
  let action: 'add' | 'remove' = 'add';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === 'add') action = 'add';
    else if (arg === 'remove') action = 'remove';
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--storybook') storybook = true;
    else if (arg === '--port') {
      const val = args[++i];
      const parsed = Number(val);
      if (!val || !/^\d+$/.test(val) || parsed < 1 || parsed > 65535) {
        ctx.err(`Not a port: ${val ?? ''}\nUsage: ${PRODUCT.command} ${TOOLBAR_HELP}`);
        return 1;
      }
      port = parsed;
    } else if (arg.startsWith('--port=')) {
      const val = arg.slice(7);
      const parsed = Number(val);
      if (!val || !/^\d+$/.test(val) || parsed < 1 || parsed > 65535) {
        ctx.err(`Not a port: ${val}\nUsage: ${PRODUCT.command} ${TOOLBAR_HELP}`);
        return 1;
      }
      port = parsed;
    } else {
      ctx.err(`Unknown option: ${arg}\nUsage: ${PRODUCT.command} ${TOOLBAR_HELP}`);
      return 1;
    }
  }

  if (action === 'remove') {
    const r = removeToolbar(ctx.cwd, { dryRun, storybook });
    ctx.out(r.status === 'removed'
      ? `${dryRun ? 'Would take' : 'Took'} the dev toolbar out of ${r.target!.rel}.`
      : `No ${PRODUCT.name} dev toolbar found${r.target ? ` in ${r.target.rel}` : ''}. Nothing changed.`);
    return 0;
  }
  const result = addToolbar(ctx.cwd, { port, dryRun, storybook });
  if (dryRun && (result.status === 'added' || result.status === 'updated')) {
    ctx.out(`Would ${result.status === 'updated' ? 'update in' : 'add to'} ${result.target.rel} (${result.target.what}):`);
    for (const l of result.lines) ctx.out(`  ${l}`);
    return 0;
  }
  report(ctx, result, port);
  return result.status === 'not-found' ? 1 : 0;
};
