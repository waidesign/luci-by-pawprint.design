import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci/format';
import { STITCH_FILE_NAME, compareComponentFiles, formatCompareReport, formatStitch } from '@luci/format/capture';
import { DesignStore, canWriteBaseline, captureRule, proposeCaptureRule, writeBaseline } from '@luci/brain';
import { parseFlags, type Command } from '../context.js';

export const CAPTURE_HELP = `capture [rule <file> | baseline [--stitch] | compare <a> <b>]
                        The design captures saved in the project. rule proposes a rule from a component
                        capture; baseline rebuilds the project's own typography, colors and spacing from
                        its stylesheets (--stitch also writes them as DESIGN.md for Google Stitch);
                        compare lists the differences between two component captures
                        (--dry-run shows what rule or baseline would write)`;

const usage = () => `Usage: ${PRODUCT.command} ${CAPTURE_HELP}`;

export const captureCommand: Command = async (args, ctx) => {
  const { flags, rest: positional, unknown } = parseFlags(args, ['--dry-run', '--stitch', '--force']);
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

  // The project design baseline (B14), rebuilt from the project's stylesheets
  if (sub === 'baseline') {
    if (file) { ctx.err(`baseline takes no file.\n${usage()}`); return 1; }
    if (!canWriteBaseline(ctx.cwd)) { ctx.err(`No ${PRODUCT.projectDir}/ here yet: run \`${PRODUCT.command} init\` first.`); return 1; }
    const dryRun = flags.has('--dry-run');
    const r = writeBaseline(ctx.cwd, { dryRun });
    if (!r.stylesheets.length) {
      ctx.out(`No stylesheets found in this project (CSS, Sass, Less, or <style> in Vue, Svelte and Astro files), so there is no design baseline.`);
      return 0;
    }
    ctx.out(`Read ${r.stylesheets.length} stylesheet${r.stylesheets.length === 1 ? '' : 's'} and ${r.tokens} custom propert${r.tokens === 1 ? 'y' : 'ies'}.`);
    if (!r.written.length) ctx.out('They set no typography, colors or spacing Luci can read, so there is no design baseline.');
    for (const f of r.written) ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${f}`);
    for (const f of r.removed) ctx.out(`  ${dryRun ? 'Would remove' : 'Removed'} ${f} (that system is no longer in the stylesheets)`);
    if (r.written.length && !dryRun) ctx.out(`\nYour agent finds them with list_captures. Your own instructions in these files stay when they are rebuilt.`);
    // The same baseline as DESIGN.md (the open format Google Stitch reads), at the project's root
    if (flags.has('--stitch') && r.written.length) {
      const file = path.join(ctx.cwd, STITCH_FILE_NAME);
      if (fs.existsSync(file) && !flags.has('--force')) {
        ctx.err(`${STITCH_FILE_NAME} is already in this project. Run again with --force to replace it.`);
        return 1;
      }
      const systems = [r.baseline.typography, r.baseline.color, r.baseline.spacing].filter((c): c is NonNullable<typeof c> => c !== null);
      if (!dryRun) fs.writeFileSync(file, formatStitch(systems, { name: `${path.basename(ctx.cwd)} design` }), 'utf8');
      ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${STITCH_FILE_NAME} (DESIGN.md format, for Google Stitch and other DESIGN.md tools)`);
    }
    return 0;
  }

  // Compare two component captures (v0.4): what differs, part by part
  if (sub === 'compare') {
    const [a, b] = [file, extra[0]];
    if (!a || !b || extra.length > 1) { ctx.err(`Name two component capture files.\n${usage()}`); return 1; }
    const read = (f: string) => store.read(path.basename(f)) ?? (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
    const [ta, tb] = [read(a), read(b)];
    if (ta === null || tb === null) { ctx.err(`Not found: ${ta === null ? a : b}`); return 1; }
    const result = compareComponentFiles(ta, tb);
    if (!result.ok) { ctx.err(result.error); return 1; }
    ctx.out(formatCompareReport(result.value, { a: path.basename(a), b: path.basename(b) }).trimEnd());
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
