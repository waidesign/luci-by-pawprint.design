/**
 * Skill selection benchmark (S7): how well Luci picks skills for tasks.
 *
 * Case sets:
 *   tuning    may be used to adjust the engine
 *   held-out  never tuned on: the honest check
 *
 * Systems measured:
 *   onboarding  SkillDiscovery.findRelevant (strict close matches, used by luci init)
 *   use         SkillOrchestrator.loadSkillsForTask (what agents get for a task)
 */
import { SkillOrchestrator } from './orchestrator.js';
import { estimateTokens, type SkillSource } from './types.js';

export interface BenchmarkCase {
  id: string;
  domain: string;
  task: string;
  /** Acceptable picks (any one counts as a hit). Empty: no skill should load. */
  relevant: string[];
}

export interface SystemResult {
  hitRate: number;
  precision: number;
  noMatchAccuracy: number;
  avgSkills: number;
  avgTokens: number;
  score: number;
}

export interface SetResult {
  cases: number;
  coveredCases: number;
  noMatchCases: number;
  systems: Record<string, SystemResult>;
}

export interface CaseResult {
  set: string;
  system: string;
  id: string;
  domain: string;
  picked: string[];
  relevantPicked: string[];
  tokens: number;
  expectNone: boolean;
}

const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

type System = (task: string) => Promise<{ ids: string[]; tokens: number }>;

export function benchmarkSystems(registry: SkillSource): Record<string, System> {
  const orchestrator = new SkillOrchestrator(registry);
  return {
    onboarding: async (task) => {
      // What an agent loads when the user accepts all onboarding suggestions (full skill text)
      const skills = await orchestrator.discovery.findRelevant(task, { limit: 5 });
      const loaded = await orchestrator.loadSkillsByIds(skills.map(s => s.id), task);
      return { ids: skills.map(s => s.id), tokens: estimateTokens(loaded.formattedInstructions) };
    },
    use: async (task) => {
      const loaded = await orchestrator.loadSkillsForTask(task, {});
      return { ids: loaded.skills.map(s => s.id), tokens: estimateTokens(loaded.formattedInstructions) };
    }
  };
}

export async function evaluateSet(cases: readonly BenchmarkCase[], systems: Record<string, System>, setName: string): Promise<{ summary: SetResult; perCase: CaseResult[] }> {
  const results: Record<string, SystemResult> = {};
  const perCase: CaseResult[] = [];

  for (const [name, run] of Object.entries(systems)) {
    const covered: { hit: boolean; precision: number }[] = [];
    const uncovered: { correctlyEmpty: boolean }[] = [];
    const tokens: number[] = [];
    const counts: number[] = [];

    for (const c of cases) {
      const { ids, tokens: t } = await run(c.task);
      const relevantPicked = ids.filter(id => c.relevant.includes(id));
      tokens.push(t);
      counts.push(ids.length);
      if (c.relevant.length > 0) covered.push({ hit: relevantPicked.length > 0, precision: ids.length ? relevantPicked.length / ids.length : 0 });
      else uncovered.push({ correctlyEmpty: ids.length === 0 });
      perCase.push({ set: setName, system: name, id: c.id, domain: c.domain, picked: ids, relevantPicked, tokens: t, expectNone: c.relevant.length === 0 });
    }

    const r: SystemResult = {
      hitRate: round(mean(covered.map(c => (c.hit ? 1 : 0)))),
      precision: round(mean(covered.map(c => c.precision))),
      noMatchAccuracy: round(mean(uncovered.map(c => (c.correctlyEmpty ? 1 : 0)))),
      avgSkills: round(mean(counts), 2),
      avgTokens: Math.round(mean(tokens)),
      score: 0
    };
    // One number to track: equal weight on finding a good skill, avoiding bad ones, and staying quiet when nothing fits
    r.score = round((r.hitRate + r.precision + r.noMatchAccuracy) / 3);
    results[name] = r;
  }

  return {
    summary: {
      cases: cases.length,
      coveredCases: cases.filter(c => c.relevant.length > 0).length,
      noMatchCases: cases.filter(c => c.relevant.length === 0).length,
      systems: results
    },
    perCase
  };
}

/** Run every case set against a skill source. */
export async function runBenchmark(registry: SkillSource, sets: Readonly<Record<string, readonly BenchmarkCase[]>>): Promise<{ sets: Record<string, SetResult>; perCase: CaseResult[] }> {
  const systems = benchmarkSystems(registry);
  const out: Record<string, SetResult> = {};
  const perCase: CaseResult[] = [];
  for (const [name, cases] of Object.entries(sets)) {
    const result = await evaluateSet(cases, systems, name);
    out[name] = result.summary;
    perCase.push(...result.perCase);
  }
  return { sets: out, perCase };
}
