import { MAX_KEYWORDS, MAX_TAGS, RANKING_VERSION, withoutDrafts } from './rankability.js';
import { PIN_BOOST } from './preferences.js';
import type { Skill, SkillSource } from './types.js';

export { RANKING_VERSION };

// LSS Ranking v1: exclusion and context rules
const NOT_FOR_MIN_MATCHED = 2;     // a whenNotToUse item needs at least this many task words matched...
const NOT_FOR_MIN_SHARE = 0.5;     // ...covering at least half of the item's words
const DOMAIN_BOOST = 1.1;          // small boost when a skill's domains match the project's

// Filler words that carry no topic. Without this, words like "a" or "on"
// matched inside unrelated skill IDs (e.g. "on" inside "animation").
const STOP_WORDS = new Set([
  'a', 'about', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'but', 'by',
  'can', 'could', 'do', 'for', 'from', 'get', 'have', 'help', 'how', 'i', 'im', 'in', 'into',
  'is', 'it', 'its', 'just', 'like', 'me', 'more', 'my', 'need', 'new', 'of', 'on', 'one',
  'or', 'our', 'should', 'so', 'some', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'this', 'to', 'up', 'us', 'use', 'using', 'very', 'want', 'was', 'we', 'what',
  'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
  'build', 'building', 'create', 'creating', 'develop', 'developing', 'make', 'making',
  'project', 'something', 'thing', 'things'
]);

// How much a match in each skill field counts. A word in the skill's ID or name says
// more about what the skill is for than a word in its description. summary and whenToUse
// are not scored: measured with the benchmark, adding them gave no gain.
const FIELD_WEIGHTS = { id: 3, name: 2, tags: 2, keywords: 2, category: 1, description: 1.5 } as const;
type Field = keyof typeof FIELD_WEIGHTS;
const FIELD_ORDER: readonly Field[] = ['id', 'name', 'tags', 'keywords', 'category', 'description'];
// Matching inside skill bodies (weak signal). Off by default so search reads only metadata.
const CONTENT_WEIGHT = Number(process.env['LUCI_CONTENT_WEIGHT'] ?? 0);

// Relevance rules for findRelevant (tuned with the benchmark):
const MIN_COVERAGE = 0.34;        // the matched words must carry at least this share of the task's meaning
const MIN_SHARE_OF_BEST = 0.4;    // and a result must score at least this share of the best result
const MIN_PART_COVERAGE = 0.5;    // a skill matching one part of a multi-part task must cover half of that part

/**
 * Split text into meaningful lowercase tokens: drops filler words and single
 * characters, joins dotted names ("three.js" -> "threejs"), and trims a plural "s".
 */
export function tokenizeQuery(text: string | undefined | null): string[] {
  const tokens = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map(t => t.replace(/^\.+|\.+$/g, '').replace(/\./g, ''))
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  return [...new Set(tokens)];
}

/** Exact for short tokens, word start for longer ones, and the reverse for word forms. */
function tokenMatchesWord(token: string, word: string): boolean {
  if (token === word) return true;
  if (token.length >= 4 && word.startsWith(token)) return true;
  if (word.length >= 5 && token.startsWith(word)) return true;
  return false;
}

/** Tie-breaker only: verified open licence and a recent check rank a skill above an equal one. */
function trustRank(skill: Skill): number {
  const status = skill.contract?.source?.licenseStatus;
  const license = status === 'open' || status === 'copyleft' ? 2 : status ? 0 : 1;
  const verified = Date.parse(skill.lastVerified ?? skill.contract?.lastVerified ?? '') || 0;
  return license * 1e13 + verified;
}

const matchesAny = (token: string, words: ReadonlySet<string>) => {
  for (const word of words) if (tokenMatchesWord(token, word)) return true;
  return false;
};

/** Split a multi-part task into its parts ("a, b, and c" -> ["a", "b", "c"]); [] for single-part tasks. */
export function splitTaskParts(task: string): string[] {
  const parts = String(task ?? '')
    .split(/[,;]|\band\b|\bthen\b|\bplus\b/i)
    .map(p => p.trim())
    .filter(p => tokenizeQuery(p).length > 0);
  return parts.length > 1 ? parts : [];
}

/** Map each query token back to the word the user typed, so explanations use their words. */
function originalWords(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of String(text ?? '').split(/[^A-Za-z0-9+#.]+/)) {
    const [token] = tokenizeQuery(raw);
    if (token && !map.has(token)) map.set(token, raw.replace(/^\.+|\.+$/g, ''));
  }
  return map;
}

const FIELD_LABELS: readonly [Field, string][] = [['id', 'name'], ['name', 'name'], ['tags', 'tags'], ['keywords', 'keywords'], ['category', 'category'], ['description', 'description']];

export interface MatchReason {
  token: string;
  word?: string;
  fields: Field[];
}

export interface ScoredSkill {
  skill: Skill;
  trust: number;
  score: number;
  strongScore: number;
  coverage: number;
  matchedTokens: number;
  namesSkill: boolean;
  reasons: MatchReason[];
  notFor?: string;
  pinned?: boolean;
}

/** Human-readable reason, e.g. 'Matched "pricing", "page" (name); "SaaS" (description).' */
export function explainMatch(entry: Pick<ScoredSkill, 'reasons'> | null | undefined): string {
  if (!entry?.reasons?.length) return 'Selected explicitly.';
  const groups = new Map<string, string[]>();
  for (const r of entry.reasons) {
    const label = FIELD_LABELS.find(([field]) => r.fields.includes(field))?.[1] ?? 'description';
    groups.set(label, [...(groups.get(label) ?? []), `"${r.word ?? r.token}"`]);
  }
  const order = ['name', 'tags', 'keywords', 'category', 'description'];
  return `Matched ${order.filter(l => groups.has(l)).map(l => `${groups.get(l)?.join(', ')} (${l})`).join('; ')}.`;
}

interface IndexEntry {
  skill: Skill;
  fields: Record<Field, Set<string>>;
  notFor: { item: string; tokens: string[] }[];
  domains: Set<string>;
  trust: number;
  content: Set<string>;
}

export interface SearchOptions {
  limit?: number;
  withScores?: boolean;
  category?: string;
  framework?: string;
  tag?: string;
  /** The project's domains: skills in them get a small boost. */
  domains?: string[];
  includeBlocked?: boolean;
}

export class SkillDiscovery {
  private index: { skills: number; entries: IndexEntry[]; df: Map<string, number> } | null = null;

  constructor(readonly registry: SkillSource) {}

  /** Word sets per skill field, plus document frequencies for IDF. Built once per skill set. */
  async getIndex(): Promise<{ skills: number; entries: IndexEntry[]; df: Map<string, number> }> {
    const skills = await this.registry.getAllSkills();
    if (this.index && this.index.skills === skills.length) return this.index;

    const entries = skills.map((original): IndexEntry => {
      // Unreviewed AI drafts don't count for ranking
      const skill = withoutDrafts(original) as Skill;
      const contract = skill.contract ?? {};
      return {
        skill: original,
        fields: {
          id: new Set(tokenizeQuery((skill.id ?? '').replace(/-/g, ' '))),
          name: new Set(tokenizeQuery(skill.name)),
          // Imported skills repeat their ID and category as tags; skip those so they don't count twice.
          // Caps stop keyword stuffing from buying a higher rank.
          tags: new Set((skill.tags ?? [])
            .map(String)
            .filter(t => t !== skill.id && t !== skill.category && t !== 'skills.sh')
            .slice(0, MAX_TAGS)
            .flatMap(t => tokenizeQuery(t))),
          keywords: new Set((skill.keywords ?? []).slice(0, MAX_KEYWORDS).flatMap(k => tokenizeQuery(String(k)))),
          category: new Set(tokenizeQuery((skill.category ?? '').replace(/-/g, ' '))),
          description: new Set(tokenizeQuery(skill.description))
        },
        notFor: (contract.whenNotToUse ?? [])
          .map(item => ({ item, tokens: tokenizeQuery(item) }))
          .filter(n => n.tokens.length >= NOT_FOR_MIN_MATCHED),
        domains: new Set((contract.domains ?? []).map(d => String(d).toLowerCase())),
        trust: trustRank(original),
        content: CONTENT_WEIGHT > 0 ? new Set(tokenizeQuery(original.content)) : new Set()
      };
    });

    this.index = { skills: skills.length, entries, df: new Map() };
    return this.index;
  }

  /** Inverse document frequency: rare words (few skills mention them) weigh more. */
  idf(index: { entries: IndexEntry[]; df: Map<string, number> }, token: string): number {
    if (!index.df.has(token)) {
      let df = 0;
      for (const entry of index.entries) if (FIELD_ORDER.some(f => matchesAny(token, entry.fields[f]))) df++;
      index.df.set(token, df);
    }
    return Math.log(1 + index.entries.length / (1 + (index.df.get(token) ?? 0)));
  }

  /** Score one indexed skill: score, coverage of the task's meaning, matched tokens and reasons. */
  scoreEntry(entry: IndexEntry, tokens: readonly string[], weights: ReadonlyMap<string, number>, totalWeight: number) {
    let score = 0;
    let coveredWeight = 0;
    let namesSkill = false;
    const reasons: MatchReason[] = [];
    const compactId = (entry.skill.id ?? '').replace(/-/g, '');

    for (const token of tokens) {
      if (token === compactId) namesSkill = true; // the task names this skill outright
      const w = weights.get(token) ?? 0;
      const fields = FIELD_ORDER.filter(f => matchesAny(token, entry.fields[f]));
      if (fields.length > 0) {
        score += fields.reduce((sum, f) => sum + FIELD_WEIGHTS[f], 0) * w;
        coveredWeight += w;
        reasons.push({ token, fields });
      } else if (entry.content.has(token)) {
        score += CONTENT_WEIGHT * w;
      }
    }
    return { score, strongScore: score, coverage: totalWeight > 0 ? coveredWeight / totalWeight : 0, matchedTokens: reasons.length, namesSkill, reasons };
  }

  /** Search skills by relevance; with `withScores`, returns scored entries. */
  async search(query: string, options: SearchOptions & { withScores: true }): Promise<ScoredSkill[]>;
  async search(query: string, options?: SearchOptions & { withScores?: false }): Promise<Skill[]>;
  async search(query: string, options?: SearchOptions): Promise<Skill[] | ScoredSkill[]>;
  async search(query: string, options: SearchOptions = {}): Promise<Skill[] | ScoredSkill[]> {
    const skills = await this.registry.getAllSkills();

    if (!query || !String(query).trim()) {
      const filtered = this.filter(skills, options);
      return options.withScores
        ? filtered.map(skill => ({ skill, trust: 0, score: 0, strongScore: 0, coverage: 0, matchedTokens: 0, namesSkill: false, reasons: [] }))
        : filtered;
    }

    // A query made only of filler words matches nothing
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return [];

    const index = await this.getIndex();
    const weights = new Map(tokens.map(t => [t, this.idf(index, t)]));
    const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);
    const words = originalWords(query);

    const projectDomains = new Set((options.domains ?? []).map(d => String(d).toLowerCase()));
    const prefs = this.registry.preferences ?? { pinned: [], blocked: [] };
    const blocked = new Set(options.includeBlocked ? [] : prefs.blocked);
    const pinned = new Set(prefs.pinned);

    const scored: ScoredSkill[] = [];
    for (const entry of index.entries) {
      if (blocked.has(entry.skill.id)) continue;
      if (!this.matchesFilter(entry.skill, options)) continue;
      const result: Omit<ScoredSkill, 'skill' | 'trust'> = this.scoreEntry(entry, tokens, weights, totalWeight);
      if (result.score <= 0) continue;
      for (const r of result.reasons) r.word = words.get(r.token) ?? r.token;

      // Exclusion: the author said the skill is not for tasks like this one
      const notFor = entry.notFor.find(n => {
        const matched = n.tokens.filter(t => tokens.some(q => tokenMatchesWord(q, t)));
        return matched.length >= NOT_FOR_MIN_MATCHED && matched.length / n.tokens.length >= NOT_FOR_MIN_SHARE;
      });
      if (notFor) result.notFor = notFor.item;

      if (projectDomains.size && [...entry.domains].some(d => projectDomains.has(d))) result.score *= DOMAIN_BOOST;

      // Pinned: a small boost. Coverage is unchanged, so a pin never makes an unfitting skill qualify.
      if (pinned.has(entry.skill.id)) {
        result.score *= PIN_BOOST;
        result.pinned = true;
      }
      scored.push({ skill: entry.skill, trust: entry.trust, ...result });
    }

    // Relevance first; trust only breaks exact ties
    scored.sort((a, b) => b.score - a.score || b.trust - a.trust);
    const limited = options.limit && options.limit > 0 ? scored.slice(0, options.limit) : scored;
    return options.withScores ? limited : limited.map(e => e.skill);
  }

  /**
   * Only close matches, for suggesting skills from a free-text task or goal.
   * Returns [] for fields the library does not cover, rather than unrelated skills.
   */
  async findRelevant(query: string, options: SearchOptions & { withScores: true }): Promise<ScoredSkill[]>;
  async findRelevant(query: string, options?: SearchOptions): Promise<Skill[]>;
  async findRelevant(query: string, options: SearchOptions = {}): Promise<Skill[] | ScoredSkill[]> {
    const limit = options.limit || 5;
    const whole = await this.search(query, { ...options, limit: 0, withScores: true });
    const qualified = new Set(this.closeMatches(whole).map(e => e.skill.id));

    // Multi-part tasks: a skill that covers one part qualifies too, but only through its
    // ID, name, tags or category, so a passing phrase in a description is not enough.
    for (const part of splitTaskParts(query)) {
      const entries = await this.search(part, { ...options, limit: 0, withScores: true });
      const structural = entries.filter(e => e.reasons.some(r => r.fields.some(f => f !== 'description')));
      for (const e of this.closeMatches(structural, MIN_PART_COVERAGE)) qualified.add(e.skill.id);
    }

    const relevant = whole.filter(e => qualified.has(e.skill.id)).slice(0, limit);
    return options.withScores ? relevant : relevant.map(e => e.skill);
  }

  /** Entries that cover enough of the query and score near the best one. */
  closeMatches(entries: readonly ScoredSkill[], minCoverage = MIN_COVERAGE): ScoredSkill[] {
    // Skills whose whenNotToUse matches the task are never suggested
    const strong = entries.filter(e => !e.notFor && (e.namesSkill || (e.matchedTokens > 0 && e.coverage >= minCoverage)));
    const best = strong[0]?.score;
    if (best === undefined) return [];
    return strong.filter(e => e.namesSkill || e.score >= best * MIN_SHARE_OF_BEST);
  }

  filter(skills: readonly Skill[], options: SearchOptions = {}): Skill[] {
    const result = skills.filter(skill => this.matchesFilter(skill, options));
    return options.limit && options.limit > 0 ? result.slice(0, options.limit) : result;
  }

  matchesFilter(skill: Skill, options: SearchOptions = {}): boolean {
    const blocked = new Set(options.includeBlocked ? [] : (this.registry.preferences?.blocked ?? []));
    if (blocked.has(skill.id)) return false;
    if (options.category && skill.category.toLowerCase() !== options.category.toLowerCase()) return false;
    if (options.framework) {
      const target = options.framework.toLowerCase();
      const supported = (skill.frameworks ?? []).map(f => f.toLowerCase());
      if (!supported.includes('any') && !supported.includes(target)) return false;
    }
    if (options.tag) {
      const target = options.tag.toLowerCase();
      if (!(skill.tags ?? []).map(t => t.toLowerCase()).includes(target)) return false;
    }
    return true;
  }
}
