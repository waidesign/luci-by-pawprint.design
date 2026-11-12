import { PRODUCT } from '@luci/format';
import { CODE_MAP_SETUP_HINT, CodeMap, GraphifyInstaller, ensureGraphify, locateGraph, mapFreshness, readGraphStats } from '@luci/brain';
import { parseFlags, type Command } from '../context.js';
import { createLineAsker } from '../onboarding.js';

export const MAP_HELP = `map [--update|--install] The code map: status; --update builds or refreshes it; --install installs Graphify`;

/** Factories the command uses; tests replace them so no real Graphify runs. */
export const mapServices = {
  codeMap: (dir: string) => new CodeMap({ projectRoot: dir }),
  installer: () => new GraphifyInstaller()
};

const cmd = (args: string) => `\`${PRODUCT.command} ${args}\``;

export const mapCommand: Command = async (args, ctx) => {
  const { flags, unknown } = parseFlags(args, ['--update', '--full', '--install', '--yes']);
  if (unknown.length) {
    ctx.err(`Unknown option: ${unknown.join(' ')}\nUsage: ${PRODUCT.command} ${MAP_HELP}`);
    return 1;
  }
  const codeMap = mapServices.codeMap(ctx.cwd);

  if (flags.has('--install')) {
    // Running this command is consent to install Graphify; the uv script (a remote installer) is still confirmed unless --yes
    const asker = ctx.isTTY && !ctx.ask ? createLineAsker() : null;
    const ask = ctx.isTTY ? ctx.ask ?? asker!.ask : null;
    try {
      const res = await ensureGraphify({
        codeMap,
        installer: mapServices.installer(),
        confirmGraphify: false,
        confirmUv: !flags.has('--yes'),
        ask: ask ? async (q) => ['y', 'yes'].includes((await ask(q)).trim().toLowerCase()) : null,
        log: ctx.out
      });
      if (!res.available) return 1;
      if (!res.installed) ctx.out(`Graphify is already installed (${res.version}).`);
      ctx.out(`Next: ${cmd('map --update')} in a project builds its code map.`);
      return 0;
    } finally {
      asker?.close();
    }
  }

  if (flags.has('--update') || flags.has('--full')) {
    const res = await codeMap.generate({ targetDir: ctx.cwd, force: true, full: flags.has('--full') });
    if (res.skipped) {
      ctx.err(`Graphify is not installed, so there is no code map yet.\n${CODE_MAP_SETUP_HINT}`);
      return 1;
    }
    ctx.out(res.summary);
    ctx.out(`  Report:   ${res.reportPath}`);
    ctx.out(`  Explorer: ${res.htmlPath}`);
    ctx.out(`  Map:      ${res.jsonPath}`);
    return 0;
  }

  // Status only: reads files and git, never runs Graphify
  const map = mapFreshness(ctx.cwd);
  if (map.status === 'missing') {
    const version = codeMap.getCliVersion();
    ctx.out('No code map in this project yet.');
    ctx.out(version ? `Graphify is installed (${version}). Build the map with ${cmd('map --update')}.` : CODE_MAP_SETUP_HINT);
    return 0;
  }
  const paths = locateGraph(ctx.cwd)!;
  const stats = readGraphStats(paths.jsonPath);
  ctx.out(`Code map: ${paths.jsonPath}${stats ? ` (${stats.nodeCount} nodes, ${stats.edgeCount} relationships)` : ' (empty or unreadable)'}`);
  if (map.status === 'stale') {
    ctx.out(`Out of date: ${map.changedFiles} code file${map.changedFiles === 1 ? '' : 's'} changed since it was built, e.g. ${map.sample.join(', ')}.`);
    ctx.out(`Refresh it with ${cmd('map --update')}. Until then, agents should read changed files directly.`);
  } else if (map.status === 'unknown') {
    ctx.out(`Can't tell whether it is current: ${map.reason}.`);
  } else {
    ctx.out(`Current${map.builtAtCommit ? `: built at commit ${map.builtAtCommit.slice(0, 7)}` : ''}; no code changed since.`);
  }
  return 0;
};
