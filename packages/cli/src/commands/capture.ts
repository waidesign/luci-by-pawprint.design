import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci/format';
import { DesignStore, captureRule, proposeCaptureRule } from '@luci/brain';
import { parseFlags, type Command } from '../context.js';

export const CAPTURE_HELP = `capture [rule <file>]  The design captures saved in the project; rule proposes a rule from a component capture (--dry-run shows it)`;

const usage = () => `Usage: ${PRODUCT.command} ${CAPTURE_HELP}`;

export const captureCommand: Command = async (args, ctx) => {
  const { flags, rest: positional, unknown } = parseFlags(args, ['--dry-run']);
  if (unknown.length) {
    ctx.err(`Unknown option: ${unknown.join(' ')}\n${usage()}`);
    return 1;
  }
  const [sub, file, ...extra] = positional;
  const store = new DesignStore(ctx.cwd);

  if (!sub) {
    const files = store.list();
    if (!files.length) {
      ctx.out(`No design captures saved in ${PRODUCT.projectDir}/${MEMORY_FILES.design}/ yet. Save one with the dev toolbar (\`${PRODUCT.command} serve\`, Capture, "Save to project").`);
      return 0;
    }
    ctx.out(`Design captures in ${PRODUCT.projectDir}/${MEMORY_FILES.design}/:`);
    for (const f of files) ctx.out(`  ${f.file}  (${f.scope}${f.type && f.type !== f.scope ? `, ${f.type}` : ''}, from ${f.source}, ${f.captured})`);
    ctx.out(`\nA component can become a rule: ${PRODUCT.command} capture rule <file>`);
    return 0;
  }

  if (sub !== 'rule' || !file || extra.length) {
    ctx.err(`${sub === 'rule' ? 'Name one saved capture file.' : `Unknown capture command: ${sub}`}\n${usage()}`);
    return 1;
  }
  // A path to the file works too; only its name inside .luci/design/ counts
  const name = path.basename(file);
  if (flags.has('--dry-run')) {
    ctx.out(captureRule(ctx.cwd, name).text.trimEnd());
    ctx.out('\n(Dry run: nothing was written.)');
    return 0;
  }
  const rule = proposeCaptureRule(ctx.cwd, name);
  ctx.out(rule.existed ? `This rule is already waiting for your review: ${rule.path}` : `Proposed a rule: ${rule.path}`);
  ctx.out(`\n  ${rule.proposal.proposed}\n`);
  ctx.out(`To keep it, move that line into ${PRODUCT.projectDir}/${MEMORY_FILES.rules} (under Project-Specific Rules) and delete the proposal. ${PRODUCT.name} never edits ${MEMORY_FILES.rules} itself.`);
  return 0;
};
