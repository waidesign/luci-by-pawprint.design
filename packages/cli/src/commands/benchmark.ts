/**
 * Benchmark / Evals CLI command:
 * Reads saved local evaluation reports from `eval/` when present without
 * hardcoding unverified figures or competitor comparisons.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT } from '@luci-dev/format';
import { parseFlags, type Command } from '../context.js';

export const BENCHMARK_HELP = `benchmark [--json]    Show saved local evaluation reports from eval/`;

export interface SkillSystemMetrics {
  hitRate?: number;
  precision?: number;
  noMatchAccuracy?: number;
  avgSkills?: number;
  avgTokens?: number;
  score?: number;
}

export interface SkillSetMetrics {
  cases?: number;
  coveredCases?: number;
  noMatchCases?: number;
  systems?: Record<string, SkillSystemMetrics>;
}

export interface SkillBaselineReport {
  generatedAt?: string;
  sets?: Record<string, SkillSetMetrics>;
  library?: {
    skills?: number;
    largestSkillTokens?: number;
  };
}

export interface MultiPageRunEntry {
  run: number;
  format?: string;
  applied: number;
  reported: number;
  durationMs?: number;
  note?: string;
  pass: boolean;
}

export interface MultiPageReport {
  date?: string;
  format?: string;
  totalRuns?: number;
  passedRuns?: number;
  passRate?: number;
  scoreSheet?: MultiPageRunEntry[];
}

export interface SavedBenchmarkReports {
  cwd: string;
  baseline: SkillBaselineReport | null;
  multiPage: MultiPageReport | null;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function loadSavedBenchmarkReports(cwd: string): SavedBenchmarkReports {
  const evalDir = path.join(cwd, 'eval');
  return {
    cwd,
    baseline: readJsonFile<SkillBaselineReport>(path.join(evalDir, 'baseline.json')),
    multiPage: readJsonFile<MultiPageReport>(path.join(evalDir, 'multi-page-report.json'))
  };
}

function printSkillBaseline(baseline: SkillBaselineReport, out: (line?: string) => void): void {
  out('\nSkill selection baseline (eval/baseline.json):');
  if (baseline.generatedAt) out(`  Saved at: ${baseline.generatedAt}`);
  if (baseline.library?.skills !== undefined) {
    out(`  Library:  ${baseline.library.skills} skills`);
  }
  if (!baseline.sets) return;

  for (const [setName, set] of Object.entries(baseline.sets)) {
    const casesInfo = set.cases !== undefined ? ` (${set.cases} cases)` : '';
    out(`  Set: ${setName}${casesInfo}`);
    for (const [systemName, m] of Object.entries(set.systems ?? {})) {
      const parts: string[] = [];
      if (m.hitRate !== undefined) parts.push(`hit ${m.hitRate}`);
      if (m.precision !== undefined) parts.push(`precision ${m.precision}`);
      if (m.noMatchAccuracy !== undefined) parts.push(`no-match ${m.noMatchAccuracy}`);
      if (m.avgTokens !== undefined) parts.push(`avg tokens ${m.avgTokens}`);
      out(`    - ${systemName}: ${parts.join(', ')}`);
    }
  }
}

function printMultiPageReport(report: MultiPageReport, out: (line?: string) => void): void {
  out('\nMulti-page evaluation report (eval/multi-page-report.json):');
  if (report.date) out(`  Saved at: ${report.date}`);
  if (report.format) out(`  Format:   ${report.format}`);
  if (report.passedRuns !== undefined && report.totalRuns !== undefined) {
    const pct = report.passRate !== undefined ? ` (${report.passRate}%)` : '';
    out(`  Result:   ${report.passedRuns}/${report.totalRuns} passed${pct}`);
  }
  for (const entry of report.scoreSheet ?? []) {
    const status = entry.pass ? 'PASS' : 'FAIL';
    const note = entry.note ? ` — ${entry.note}` : '';
    out(`    - Run #${entry.run}: applied ${entry.applied}/6, reported ${entry.reported}/6 [${status}]${note}`);
  }
}

export const benchmarkCommand: Command = async (args, ctx) => {
  const { flags, unknown, rest } = parseFlags(args, ['--json']);
  if (unknown.length || rest.length) {
    ctx.err(`Unknown option for benchmark: ${[...unknown, ...rest].join(' ')}`);
    ctx.err(`Usage: ${PRODUCT.command} ${BENCHMARK_HELP}`);
    return 1;
  }

  const reports = loadSavedBenchmarkReports(ctx.cwd);
  if (flags.has('--json')) {
    ctx.out(JSON.stringify(reports, null, 2));
    return 0;
  }

  ctx.out(`${PRODUCT.name} evaluation reports (${ctx.cwd})`);

  if (!reports.baseline && !reports.multiPage) {
    ctx.out('No saved evaluation reports found in eval/.');
    ctx.out('Run local evaluations in the source repository to generate saved logs:');
    ctx.out('  node scripts/eval.mjs --save-baseline');
    ctx.out('  pnpm test:multipage -- --save-report');
    return 0;
  }

  if (reports.baseline) printSkillBaseline(reports.baseline, ctx.out);
  if (reports.multiPage) printMultiPageReport(reports.multiPage, ctx.out);
  return 0;
};
