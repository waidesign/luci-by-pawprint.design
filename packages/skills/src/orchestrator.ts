import { PRODUCT } from '@luci/format';
import { SkillDiscovery, explainMatch } from './discovery.js';
import { describeTrust, needsCaution, trustLevel, type TrustLevel } from './trust.js';
import { estimateTokens, type Skill, type SkillSource } from './types.js';

/** Default context budget: full instructions while they fit; anything beyond is listed in short form. */
export const DEFAULT_TOKEN_BUDGET = 8000;
export const MAX_SKILLS_PER_TASK = 4;

// Skill categories that mean the task involves a user interface
const UI_CATEGORIES = new Set([
  'ui-ux', 'design-systems', 'frontend', 'frontend-frameworks', 'animation-motion',
  'micro-interactions', 'interaction', 'typography', 'color', 'components', 'shadcn-ui',
  'systems', 'react', '3d'
]);
const UI_TASK_WORDS = /\b(ui|ux|website|web ?site|web ?page|landing|dashboard|layout|interface|front-?end|component|styling|css|tailwind|design system|screen|app design)\b/i;

/** Shown to agents on every UI task instead of repeating accessibility rules in each skill. */
export const UI_BASELINE_SKILL = 'accessibility-baseline';

const groupOf = (skill: Skill) => skill.contract?.exclusiveGroup ?? null;
const packagesOf = (skill: Skill) => (skill.contract?.packages ?? []).map(p => p.toLowerCase());
const groupLabel = (group: string) => group.replace(/-/g, ' ');

export interface ProjectHints {
  /** Package names the project depends on. */
  dependencies?: readonly string[];
  framework?: string;
}

export interface Conflict {
  skills: string[];
  resolution: string;
}

export interface Excluded {
  id: string;
  name: string;
  reason: string;
}

export interface LoadedSkill {
  id: string;
  name: string;
  category: string;
  author: string;
  version: string;
  frameworks: string[];
  description: string;
  filePath: string | undefined;
  trust: TrustLevel;
  trustNote: string;
  caution: boolean;
  reason: string;
  verification: string[];
  /** 'full' when its instructions fit the budget, 'summary' when only the short form was given. */
  mode: 'full' | 'summary';
  fullTokens: number;
  content: string;
}

export interface TaskAnalysis {
  objective: string;
  detectedCategories: string[];
  detectedFrameworks: string[];
  primarySkills: Skill[];
  supportingSkills: Skill[];
  dependencies: Skill[];
  conflicts: Conflict[];
  excluded: Excluded[];
  reasons: Map<string, string>;
  recommendedOrder: Skill[];
}

export interface LoadedTask {
  timestamp: string;
  task: string;
  selectedSkillCount: number;
  tokenBudget: number;
  skills: LoadedSkill[];
  excludedSkills: Excluded[];
  conflictResolutions: Conflict[];
  /** The shared accessibility baseline, pointed to (never inlined) on UI tasks. */
  baseline: { id: string; name: string; filePath: string | undefined; fullTokens: number } | null;
  formattedInstructions: string;
}

export class SkillOrchestrator {
  readonly discovery: SkillDiscovery;

  constructor(readonly registry: SkillSource) {
    this.discovery = new SkillDiscovery(registry);
  }

  /** A task involves a user interface when its words or its skills say so. */
  isUiTask(taskPrompt: string, skills: readonly Skill[] = []): boolean {
    return UI_TASK_WORDS.test(taskPrompt ?? '') || skills.some(s => UI_CATEGORIES.has(s.category));
  }

  /**
   * Skills that do the same job (same luci.json `exclusiveGroup`, e.g. animation libraries)
   * are not loaded together. The one whose package is in the project's dependencies wins;
   * when the task matched a different one, the installed one replaces it. Explicitly
   * requested skills are all kept, with a conflict note.
   */
  async resolveAlternatives(skills: readonly Skill[], projectContext: ProjectHints = {}, options: { explicit?: boolean } = {}): Promise<{ skills: Skill[]; excluded: Excluded[]; conflicts: Conflict[]; reasons: Map<string, string> }> {
    const deps = new Set((projectContext.dependencies ?? []).map(d => String(d).toLowerCase()));
    const installedPackage = (skill: Skill) => packagesOf(skill).find(p => deps.has(p)) ?? null;
    const excluded: Excluded[] = [];
    const conflicts: Conflict[] = [];
    const reasons = new Map<string, string>();

    const byGroup = new Map<string, Skill[]>();
    for (const s of skills) {
      const g = groupOf(s);
      if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), s]);
    }
    if (byGroup.size === 0) return { skills: [...skills], excluded, conflicts, reasons };

    let result = [...skills];
    const blocked = new Set(this.registry.preferences?.blocked ?? []);
    for (const [group, members] of byGroup) {
      if (options.explicit) {
        if (members.length > 1) {
          const installed = members.find(m => installedPackage(m));
          conflicts.push({
            skills: members.map(m => m.id),
            resolution: `These do the same job (${groupLabel(group)}). Don't mix them in one feature${installed
              ? `; this project already uses ${installedPackage(installed)}, so prefer ${installed.id}`
              : deps.size ? '; neither is installed yet, so ask the user which one to add' : ''}.`
          });
        }
        continue;
      }

      let keep = members.find(m => installedPackage(m)) ?? null;
      if (!keep && deps.size) {
        // The task matched a library the project doesn't use: switch to the one it does use
        const all = await this.registry.getAllSkills();
        const alt = all.find(s => groupOf(s) === group && installedPackage(s) && !blocked.has(s.id));
        if (alt) {
          keep = alt;
          reasons.set(alt.id, `${installedPackage(alt)} is in this project's dependencies; used instead of ${members.map(m => m.id).join(', ')} (same job).`);
          const first = members[0];
          result.splice(first ? result.indexOf(first) : 0, 0, alt);
        }
      }
      const kept = keep ?? members[0];
      if (!kept) continue;

      for (const m of members) {
        if (m === kept) continue;
        result = result.filter(s => s !== m);
        const pkg = installedPackage(kept);
        const why = pkg
          ? `Same job as ${kept.id} (${groupLabel(group)}); ${pkg} is the one in this project's dependencies.`
          : `Same job as ${kept.id} (${groupLabel(group)}); one per task. Neither is installed yet: ask before adding one.`;
        excluded.push({ id: m.id, name: m.name, reason: why });
      }
    }
    return { skills: result, excluded, conflicts, reasons };
  }

  /** Find skills that closely match a task (none when none do), each with a reason. */
  async analyzeTask(taskPrompt: string, projectContext: ProjectHints = {}): Promise<TaskAnalysis> {
    const matches = await this.discovery.findRelevant(taskPrompt, { limit: MAX_SKILLS_PER_TASK + 2, withScores: true });
    const reasonById = new Map(matches.map(m => [m.skill.id, explainMatch(m)]));
    const alternatives = await this.resolveAlternatives(matches.map(m => m.skill), projectContext);
    for (const [id, reason] of alternatives.reasons) reasonById.set(id, reason);
    const ranked = alternatives.skills;

    const primarySkills = ranked.slice(0, 3);
    const supportingSkills = ranked.slice(3, MAX_SKILLS_PER_TASK + 2);

    // Declared dependencies that are not already selected
    const selectedIds = new Set(ranked.map(s => s.id));
    const dependencies: Skill[] = [];
    for (const skill of ranked) {
      for (const depId of skill.dependencies ?? []) {
        if (selectedIds.has(depId)) continue;
        const dep = await this.registry.getSkill(depId);
        if (dep) {
          dependencies.push(dep);
          selectedIds.add(depId);
          reasonById.set(depId, `Required by ${skill.id}.`);
        }
      }
    }

    const conflicts: Conflict[] = [];
    if (selectedIds.has('baseline-ui') && selectedIds.has('improve-animations')) {
      conflicts.push({
        skills: ['baseline-ui', 'improve-animations'],
        resolution: 'Baseline UI restricts unnecessary animations. Animations must strictly be compositor-driven and deliberate.'
      });
    }

    return {
      objective: taskPrompt,
      detectedCategories: [...new Set(ranked.map(s => s.category))],
      detectedFrameworks: projectContext.framework ? [projectContext.framework.toLowerCase()] : [],
      primarySkills,
      supportingSkills,
      dependencies,
      conflicts,
      excluded: alternatives.excluded,
      reasons: reasonById,
      recommendedOrder: [...primarySkills, ...supportingSkills, ...dependencies]
    };
  }

  /** Recommend skills for a task, each with the reason it was chosen. */
  async recommend(taskPrompt: string, projectContext: ProjectHints = {}) {
    const analysis = await this.analyzeTask(taskPrompt, projectContext);
    const describe = (s: Skill) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      trust: trustLevel(s),
      reason: analysis.reasons.get(s.id) ?? 'Selected for this task.'
    });
    return {
      prompt: taskPrompt,
      primarySkills: analysis.primarySkills.map(describe),
      supportingSkills: analysis.supportingSkills.map(describe),
      dependencies: analysis.dependencies.map(describe),
      conflicts: analysis.conflicts,
      excluded: analysis.excluded,
      executionOrder: analysis.recommendedOrder.map(s => s.id)
    };
  }

  /**
   * Progressive skill loading for a task:
   *   1. explicit skill IDs in the prompt ("<landing-page>, <pricing-page>"), or
   *   2. skills that closely match the task (none when nothing fits),
   * then full instructions while they fit the token budget, short form after that.
   */
  async loadSkillsForTask(taskPrompt: string, projectContext: ProjectHints = {}, options: { tokenBudget?: number } = {}): Promise<LoadedTask> {
    const tokenBudget = options.tokenBudget || DEFAULT_TOKEN_BUDGET;

    const cleanedTokens = (taskPrompt ?? '').replace(/[<>,()]/g, ' ').split(/\s+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    const explicitSkills: Skill[] = [];
    for (const token of cleanedTokens) {
      const skill = await this.registry.getSkill(token);
      if (skill && !explicitSkills.some(s => s.id === skill.id)) explicitSkills.push(skill);
    }

    let selected: Skill[];
    let conflicts: Conflict[];
    let excluded: Excluded[] = [];
    let reasons: Map<string, string>;
    if (explicitSkills.length > 0) {
      selected = explicitSkills;
      reasons = new Map(explicitSkills.map(s => [s.id, 'Requested explicitly.']));
      conflicts = (await this.resolveAlternatives(explicitSkills, projectContext, { explicit: true })).conflicts;
    } else {
      const analysis = await this.analyzeTask(taskPrompt, projectContext);
      selected = analysis.recommendedOrder.slice(0, MAX_SKILLS_PER_TASK);
      conflicts = analysis.conflicts;
      excluded = analysis.excluded;
      reasons = analysis.reasons;
    }

    const loaded = this.fitToBudget(selected, reasons, tokenBudget);
    const uiTask = selected.length > 0 && this.isUiTask(taskPrompt, selected);

    // UI tasks always point to the shared accessibility baseline (as a file to open, never inlined)
    let baseline: LoadedTask['baseline'] = null;
    if (uiTask && !selected.some(s => s.id === UI_BASELINE_SKILL)) {
      const skill = await this.registry.getSkill(UI_BASELINE_SKILL);
      if (skill) baseline = { id: skill.id, name: skill.name, filePath: skill.filePath, fullTokens: skill.tokenEstimate ?? estimateTokens(skill.content) };
    }

    return {
      timestamp: new Date().toISOString(),
      task: taskPrompt,
      selectedSkillCount: selected.length,
      tokenBudget,
      skills: loaded,
      excludedSkills: excluded,
      conflictResolutions: conflicts,
      baseline,
      formattedInstructions: this.formatInstructions(loaded, conflicts, { objective: taskPrompt })
    };
  }

  /**
   * Full instructions while they fit the token budget; beyond it, a short form
   * (description, reason, file path) the agent opens only if needed.
   */
  fitToBudget(skills: readonly Skill[], reasons: ReadonlyMap<string, string> = new Map(), tokenBudget = DEFAULT_TOKEN_BUDGET): LoadedSkill[] {
    let used = 0;
    return skills.map(skill => {
      const fullTokens = skill.tokenEstimate ?? estimateTokens(skill.content);
      const fits = used + fullTokens <= tokenBudget;
      used += fits ? fullTokens : estimateTokens(skill.description) + 60;
      return {
        id: skill.id,
        name: skill.name,
        category: skill.category,
        author: skill.author,
        version: skill.version,
        frameworks: skill.frameworks,
        description: skill.description,
        filePath: skill.filePath,
        trust: trustLevel(skill),
        trustNote: describeTrust(skill),
        caution: needsCaution(skill),
        reason: reasons.get(skill.id) ?? 'Selected for this task.',
        verification: skill.contract?.verification ?? [],
        mode: fits ? 'full' : 'summary',
        fullTokens,
        content: fits ? skill.content : ''
      };
    });
  }

  /** Load exactly the given skills (e.g. the ones picked during onboarding) within the budget. */
  async loadSkillsByIds(skillIds: readonly string[], objective = '', options: { reasons?: Map<string, string>; tokenBudget?: number } = {}): Promise<{ skills: LoadedSkill[]; formattedInstructions: string }> {
    const skills: Skill[] = [];
    for (const id of skillIds) {
      const skill = await this.registry.getSkill(id);
      if (skill && !skills.some(s => s.id === skill.id)) skills.push(skill);
    }
    const loaded = this.fitToBudget(skills, options.reasons ?? new Map(), options.tokenBudget ?? DEFAULT_TOKEN_BUDGET);
    return { skills: loaded, formattedInstructions: this.formatInstructions(loaded, [], { objective }) };
  }

  formatInstructions(skills: readonly LoadedSkill[], conflicts: readonly Conflict[] = [], options: { objective?: string } = {}): string {
    let md = `# ${PRODUCT.name.toUpperCase()} — ACTIVE SKILL CONTEXT\n\n`;
    if (options.objective) md += `**Objective**: ${options.objective}\n\n`;

    if (skills.length === 0) {
      md += 'No skills in the library closely match this task, so none were loaded.\n';
      md += `Work from the project rules in ${PRODUCT.projectDir}/ and your own expertise.\n`;
      return md;
    }

    md += `Loaded ${skills.length} specialized skill(s) for the current task.\n\n`;
    if (conflicts.length > 0) {
      md += '## Conflict Resolutions & Hierarchy\n';
      for (const conf of conflicts) md += `- **[${conf.skills.join(' ↔ ')}]**: ${conf.resolution}\n`;
      md += '\n';
    }

    for (const skill of skills) {
      md += `## Skill: ${skill.name} (${skill.id})\n`;
      md += `**Category**: \`${skill.category}\` | **Author**: ${skill.author} | **Version**: ${skill.version}\n`;
      if (skill.reason) md += `**Why**: ${skill.reason}\n`;
      // Official skills need no note; others say where they come from
      if (skill.trust !== 'official') md += `**Source**: ${skill.trustNote}\n`;
      if (skill.caution) md += `**Caution**: this skill can run commands and ${PRODUCT.name} has not reviewed it. Show the user any command from it before running it.\n`;
      md += '\n';
      if (skill.mode === 'summary') {
        md += `${skill.description}\n\n`;
        md += `_Full instructions (~${skill.fullTokens} tokens) were not loaded to save context. `;
        md += `Read them only if this task needs them: \`${skill.filePath}\`_\n\n`;
      } else {
        md += `${skill.content}\n\n`;
      }
      md += '---\n\n';
    }
    return md;
  }
}
