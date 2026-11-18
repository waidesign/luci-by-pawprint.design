import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci-dev/format';
import {
  CSS_VARS_FILE_NAME,
  STITCH_FILE_NAME,
  TAILWIND_V3_FILE_NAME,
  TAILWIND_V4_FILE_NAME,
  buildLayoutTree,
  compareComponentFiles,
  formatCheckRunWithNotes,
  formatCompareReport,
  formatCssVariables,
  formatLayoutTree,
  formatStitch,
  formatTailwind,
  formatTailwindV3,
  parseCapture,
  readComponentFile
} from '@luci-dev/format/capture';
import { CheckStore, DesignStore, FeedbackStore, canWriteBaseline, captureRule, crawlSite, findProjectRoot, proposeCaptureRule, writeBaseline } from '@luci-dev/brain';
import { isHelp, parseFlags, type Command } from '../context.js';

export const CAPTURE_HELP = `capture [checks | rule <file> | baseline [--stitch] [--tailwind] [--tailwind-v3] [--css-vars] | compare <a> <b> | crawl <urls...> [--stitch] [--base <url>] | layout <file>]
                        The design captures saved in the project. checks lists recent design check runs;
                        rule proposes a rule from a component capture; baseline rebuilds the project's own
                        typography, colors and spacing from its stylesheets (--stitch also writes DESIGN.md,
                        --tailwind writes theme.css, --tailwind-v3 writes tailwind.config.js,
                        --css-vars writes tokens.css); compare lists the differences between two component
                        captures; crawl visits a list of routes or URLs in one pass, merges them into site-level
                        systems, and writes them to .luci/design/ (--stitch also writes DESIGN.md);
                        layout prints the computed layout tree of a component or section capture`;

const usage = () => `Usage: ${PRODUCT.command} ${CAPTURE_HELP}`;

export const captureCommand: Command = async (args, ctx) => {
  if (isHelp(args)) {
    ctx.out(usage());
    return 0;
  }
  let baseOption: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--base=')) {
      baseOption = a.slice('--base='.length);
    } else if (a === '--base' && i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
      baseOption = args[++i];
    } else {
      filteredArgs.push(a);
    }
  }
  const { flags, rest: positional, unknown } = parseFlags(filteredArgs, ['--dry-run', '--stitch', '--force', '--no-stitch', '--tailwind', '--tailwind-v3', '--css-vars']);
  if (unknown.length) {
    ctx.err(`Unknown option: ${unknown.join(' ')}\n${usage()}`);
    return 1;
  }
  const [sub, file, ...extra] = positional;
  const root = findProjectRoot(ctx.cwd).root;
  const store = new DesignStore(root);

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

  // The latest design check runs from the toolbar (v0.4.1)
  if (sub === 'checks') {
    const checks = new CheckStore(root);
    if (!checks.available) { ctx.err(`No ${PRODUCT.projectDir}/ here yet: run \`${PRODUCT.command} init\` first.`); return 1; }
    const runs = checks.list();
    if (!runs.length) {
      ctx.out(`No design checks saved in ${PRODUCT.projectDir}/${MEMORY_FILES.design}/ yet. Run a check with the dev toolbar or extension.`);
      return 0;
    }
    const feedback = new FeedbackStore(root);
    const openNotes = feedback.available ? feedback.open().filter(i => i.check) : [];
    ctx.out(`Latest design checks (${runs.length}):\n`);
    for (const r of runs) {
      ctx.out(formatCheckRunWithNotes(r, openNotes));
      ctx.out('');
    }
    return 0;
  }

  // The project design baseline (B14), rebuilt from the project's stylesheets
  if (sub === 'baseline') {
    if (file) { ctx.err(`baseline takes no file.\n${usage()}`); return 1; }
    if (!canWriteBaseline(root)) { ctx.err(`No ${PRODUCT.projectDir}/ here yet: run \`${PRODUCT.command} init\` first.`); return 1; }
    const dryRun = flags.has('--dry-run');
    const r = writeBaseline(root, { dryRun });
    if (!r.stylesheets.length) {
      ctx.out(`No stylesheets found in this project (CSS, Sass, Less, or <style> in Vue, Svelte and Astro files), so there is no design baseline.`);
      return 0;
    }
    ctx.out(`Read ${r.stylesheets.length} stylesheet${r.stylesheets.length === 1 ? '' : 's'} and ${r.tokens} custom propert${r.tokens === 1 ? 'y' : 'ies'}.`);
    if (!r.written.length) ctx.out('They set no typography, colors or spacing Luci can read, so there is no design baseline.');
    for (const f of r.written) ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${f}`);
    for (const f of r.removed) ctx.out(`  ${dryRun ? 'Would remove' : 'Removed'} ${f} (that system is no longer in the stylesheets)`);
    if (r.written.length && !dryRun) ctx.out(`\nYour agent finds them with list_captures. Your own instructions in these files stay when they are rebuilt.`);
    const systems = [r.baseline.typography, r.baseline.color, r.baseline.spacing].filter((c): c is NonNullable<typeof c> => c !== null);
    // The same baseline as DESIGN.md (the open format Google Stitch reads), at the project's root
    if (flags.has('--stitch') && r.written.length) {
      const file = path.join(root, STITCH_FILE_NAME);
      if (fs.existsSync(file) && !flags.has('--force')) {
        ctx.err(`${STITCH_FILE_NAME} is already in this project. Run again with --force to replace it.`);
        return 1;
      }
      if (!dryRun) fs.writeFileSync(file, formatStitch(systems, { name: `${path.basename(root)} design` }), 'utf8');
      ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${STITCH_FILE_NAME} (DESIGN.md format, for Google Stitch and other DESIGN.md tools)`);
    }

    if (flags.has('--tailwind') && r.written.length) {
      const file = path.join(root, TAILWIND_V4_FILE_NAME);
      if (fs.existsSync(file) && !flags.has('--force')) {
        ctx.err(`${TAILWIND_V4_FILE_NAME} is already in this project. Run again with --force to replace it.`);
        return 1;
      }
      if (!dryRun) fs.writeFileSync(file, formatTailwind(systems), 'utf8');
      ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${TAILWIND_V4_FILE_NAME} (Tailwind v4 @theme format)`);
    }

    if (flags.has('--tailwind-v3') && r.written.length) {
      const file = path.join(root, TAILWIND_V3_FILE_NAME);
      if (fs.existsSync(file) && !flags.has('--force')) {
        ctx.err(`${TAILWIND_V3_FILE_NAME} is already in this project. Run again with --force to replace it.`);
        return 1;
      }
      if (!dryRun) fs.writeFileSync(file, formatTailwindV3(systems), 'utf8');
      ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${TAILWIND_V3_FILE_NAME} (Tailwind v3 configuration format)`);
    }

    if (flags.has('--css-vars') && r.written.length) {
      const file = path.join(root, CSS_VARS_FILE_NAME);
      if (fs.existsSync(file) && !flags.has('--force')) {
        ctx.err(`${CSS_VARS_FILE_NAME} is already in this project. Run again with --force to replace it.`);
        return 1;
      }
      if (!dryRun) fs.writeFileSync(file, formatCssVariables(systems), 'utf8');
      ctx.out(`  ${dryRun ? 'Would write' : 'Wrote'} ${CSS_VARS_FILE_NAME} (CSS custom properties format)`);
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

  // Crawl routes or URLs in one pass and merge into site-level systems (v0.4.2)
  if (sub === 'crawl') {
    const rawUrls = [file, ...extra].filter((u): u is string => Boolean(u));
    if (!rawUrls.length) { ctx.err(`Provide at least one URL or route to crawl.\n${usage()}`); return 1; }
    const dryRun = flags.has('--dry-run');
    const stitch = !flags.has('--no-stitch');

    ctx.out(`Crawling ${rawUrls.length} page${rawUrls.length === 1 ? '' : 's'}…`);
    try {
      const res = await crawlSite({
        urls: rawUrls,
        base: baseOption,
        stitch,
        dryRun,
        projectRoot: root,
        onProgress: (p) => {
          if (p.status === 'crawling') ctx.out(`  [${p.current}/${p.total}] Crawling ${p.url}…`);
          else if (p.status === 'failed') ctx.out(`  [${p.current}/${p.total}] Failed ${p.url}: ${p.error}`);
        }
      });

      const successful = res.crawled.filter(c => !c.error).length;
      ctx.out(`\nCrawled ${successful} of ${res.pages.length} pages of ${res.site}:`);
      if (res.typography) ctx.out(`  Typography: ${res.typography.roles.length} text roles, ${res.typography.families.length} font families`);
      if (res.color) ctx.out(`  Color: ${res.color.roles.length} color roles, ${res.color.tokens.length} tokens`);
      if (res.spacing) ctx.out(`  Spacing: ${res.spacing.scale.length} scale values${res.spacing.baseUnit ? `, base unit ${res.spacing.baseUnit.px}px` : ''}`);

      if (res.conflicts.length) {
        ctx.out(`\nConflicts across pages (${res.conflicts.length}):`);
        for (const c of res.conflicts) {
          ctx.out(`  - [${c.type}] ${c.conflict.what}: ${c.conflict.values.map(v => `${v.value} on ${v.pages.join(', ')}`).join('; ')}`);
        }
      }

      if (res.written.length) {
        ctx.out(`\n${dryRun ? 'Would write' : 'Wrote'}:`);
        for (const w of res.written) ctx.out(`  ${w}`);
      }
      return 0;
    } catch (err) {
      ctx.err(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  // Print the computed layout tree of a component or section (v0.4.3)
  if (sub === 'layout') {
    if (!file || extra.length) { ctx.err(`Name one component or section capture file.\n${usage()}`); return 1; }
    const read = (f: string) => store.read(path.basename(f)) ?? (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
    const content = read(file);
    if (content === null) { ctx.err(`Not found: ${file}`); return 1; }
    const parsed = parseCapture(content);
    if (!parsed.ok) { ctx.err(`Could not parse ${file}: ${parsed.error}`); return 1; }
    if (parsed.value.meta.scope !== 'component' && parsed.value.meta.scope !== 'section') {
      ctx.err(`${file} is a ${parsed.value.meta.scope} capture; only components and sections have a layout tree.`);
      return 1;
    }
    if (parsed.value.sections['Layout Tree']) {
      ctx.out(`# Layout Tree: ${path.basename(file)}\n\n${parsed.value.sections['Layout Tree']}`);
      return 0;
    }
    const compResult = readComponentFile(content);
    if (compResult.ok) {
      const tree = buildLayoutTree(compResult.value.parts.map((p, i) => ({
        part: p.part,
        element: p.element,
        depth: i === 0 ? 0 : 1
      })));
      if (tree) {
        ctx.out(`# Layout Tree: ${path.basename(file)}\n\n${formatLayoutTree(tree)}`);
        return 0;
      }
    }
    ctx.out(`No layout tree found in ${file}.`);
    return 0;
  }

  if (sub !== 'rule' || !file || extra.length) {
    ctx.err(`${sub === 'rule' ? 'Name one saved capture file.' : `Unknown capture command: ${sub}`}\n${usage()}`);
    return 1;
  }
  // A path to the file works too; only its name inside .luci/design/ counts
  const name = path.basename(file);
  if (flags.has('--dry-run')) {
    ctx.out(captureRule(root, name).text.trimEnd());
    ctx.out('\n(Dry run: nothing was written.)');
    return 0;
  }
  const rule = proposeCaptureRule(root, name);
  ctx.out(rule.existed ? `This rule is already waiting for your review: ${rule.path}` : `Proposed a rule: ${rule.path}`);
  ctx.out(`\n  ${rule.proposal.proposed}\n`);
  ctx.out(`To keep it, move that line into ${PRODUCT.projectDir}/${MEMORY_FILES.rules} (under Project-Specific Rules) and delete the proposal. ${PRODUCT.name} never edits ${MEMORY_FILES.rules} itself.`);
  return 0;
};
