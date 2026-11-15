import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PRODUCT } from '@luci-dev/format';
import { findProjectRoot } from '@luci-dev/brain';
import { DEFAULT_PORT, startBridge } from '../serve/bridge.js';
import type { Command } from '../context.js';
import { cliVersion } from '../version.js';
import { findToolbarTarget, manualToolbarHelp, toolbarInstalledIn } from '../toolbarSetup.js';
import { offerToolbar } from './toolbar.js';

export const SERVE_HELP = `serve [--port <n>]      Connect the dev toolbar to this project (feedback and captures in ${PRODUCT.projectDir}/)`;

/** The dev toolbar's browser script, from the @luci-dev/toolbar package; null until it is built. */
export function toolbarScriptPath(): string | null {
  try {
    const file = createRequire(import.meta.url).resolve('@luci-dev/toolbar/script');
    return fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export const serveCommand: Command = async (args, ctx) => {
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = Number(args[++i]);
    else if (/^--port=\d+$/.test(arg)) port = Number(arg.slice(7));
    else {
      ctx.err(`Unknown option: ${arg}\nUsage: ${PRODUCT.command} ${SERVE_HELP}`);
      return 1;
    }
  }
  if (port > 65535) { ctx.err(`Not a port: ${port}`); return 1; }

  let bridge;
  const root = findProjectRoot(ctx.cwd).root;
  try {
    bridge = await startBridge({
      projectDir: root,
      port,
      version: cliVersion(),
      toolbarScript: () => { const f = toolbarScriptPath(); return f ? fs.readFileSync(f, 'utf8') : null; }
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      ctx.err(`Port ${port} is in use (maybe ${PRODUCT.command} serve is already running). Try \`${PRODUCT.command} serve --port ${port + 1}\`.`);
      return 1;
    }
    throw err;
  }

  ctx.out(`${PRODUCT.name} is connected to ${root}: ${bridge.url}`);
  if (!fs.existsSync(`${root}/${PRODUCT.projectDir}`)) ctx.out(`No ${PRODUCT.projectDir}/ here yet: run \`${PRODUCT.command} init\` first, or feedback cannot be saved.`);
  // The second chance to add the toolbar (missed or skipped at init): ask in a terminal, else say how
  const servedOn = Number(new URL(bridge.url).port);
  const installed = toolbarInstalledIn(ctx.cwd) || toolbarInstalledIn(root);
  if (installed) ctx.out(`Dev toolbar: in ${installed.rel}. Open your app on this machine; Luci's button is in the bottom corner.`);
  else if (ctx.isTTY && (findToolbarTarget(ctx.cwd) || findToolbarTarget(root))) await offerToolbar(ctx, servedOn);
  else {
    ctx.out(`The dev toolbar is not in your app yet. Add it with \`${PRODUCT.command} toolbar${servedOn === DEFAULT_PORT ? '' : ` --port ${servedOn}`}\`, or by hand:`);
    for (const line of manualToolbarHelp(servedOn).slice(1, 2)) ctx.out(line);
  }
  ctx.out(`Feedback goes to ${PRODUCT.projectDir}/feedback/, captures you save to ${PRODUCT.projectDir}/design/. Your agent reads them with ${PRODUCT.mcpServer}.`);
  ctx.out('Only pages on this machine can reach it. Press Ctrl+C to stop.');

  await new Promise<void>(resolve => {
    const stop = () => resolve();
    ctx.signal?.addEventListener('abort', stop, { once: true });
    if (!ctx.signal) {
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  });
  await bridge.close();
  ctx.out('Stopped.');
  return 0;
};
