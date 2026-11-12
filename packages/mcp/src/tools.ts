/**
 * The tools `luci-mcp` serves (B11). Each tool is a name, a description, a Zod input
 * shape and a handler; `handleTool` validates the input and runs the handler, so tests
 * call tools directly without a transport. Tools that write say so in their description
 * and in their annotations, and they never create .luci/ except initialize_project.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MEMORY_FILES, PROPOSAL_TARGETS, PRODUCT, formatProposal } from '@luci/format';
import {
  CODE_MAP_SETUP_HINT,
  CodeMap,
  MemoryEngine,
  detectProject,
  locateGraph,
  mapFreshness,
  readGraphStats,
  initProject,
  intakeDocs,
  loadProjectContext,
  memoryDir,
  memoryPath,
  readActiveTask,
  startProject
} from '@luci/brain';
import {
  SkillDiscovery,
  SkillOrchestrator,
  addPack,
  describeTrust,
  loadPacks,
  loadProjectSkillsForTask,
  packReasons,
  packSkills,
  removePack,
  selectSkills,
  trustLevel,
  writeCatalog,
  type Skill,
  type SkillSource
} from '@luci/skills';

export interface ToolDeps {
  /** The skill library: Luci's library plus the user's personal one. */
  registry: SkillSource;
  /** The default project folder when a call gives no projectPath. */
  cwd: string;
  /** The user's Global Brain (default ~/.luci/brain). */
  globalBrainDir?: string;
  /** Makes the code map runner for a project (tests replace it so no real Graphify runs). */
  codeMap?: (projectDir: string) => CodeMap;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface LuciTool {
  name: string;
  description: string;
  input: z.ZodRawShape;
  annotations: ToolAnnotations;
  call(args: unknown, deps: ToolDeps): Promise<ToolResult>;
}

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });
const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2));
const error = (message: string): ToolResult => ({ isError: true, content: [{ type: 'text', text: message }] });

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  input: S,
  annotations: ToolAnnotations,
  run: (args: z.output<z.ZodObject<S>>, deps: ToolDeps) => Promise<ToolResult> | ToolResult
): LuciTool {
  const schema = z.object(input);
  return {
    name,
    description,
    input,
    annotations,
    async call(args, deps) {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) return error(`Invalid input for ${name}:\n${z.prettifyError(parsed.error)}`);
      return run(parsed.data, deps);
    }
  };
}

const projectPath = z.string().optional().describe('Project folder (defaults to the folder the server was started in)');
const target = (args: { projectPath?: string | undefined }, deps: ToolDeps) => path.resolve(deps.cwd, args.projectPath ?? '.');
const notInitialized = (dir: string) =>
  error(`No ${PRODUCT.projectDir}/ in ${dir}. Ask the user to run \`${PRODUCT.command} init\` there (or call initialize_project once they agree). Nothing was written.`);
const hasMemory = (dir: string) => fs.existsSync(memoryDir(dir));
const hints = (dir: string) => {
  if (!fs.existsSync(path.join(dir, 'package.json'))) return {};
  const info = detectProject(dir);
  return { dependencies: info.dependencies, framework: info.framework };
};
const brainOptions = (deps: ToolDeps) => (deps.globalBrainDir ? { globalBrainDir: deps.globalBrainDir } : {});
const brief = (s: Skill) => ({ id: s.id, name: s.name, category: s.category, description: s.description, trust: trustLevel(s) });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'proposal';
const today = () => new Date().toISOString().slice(0, 10);

export const TOOLS: readonly LuciTool[] = [
  tool('get_project_context',
    `Everything ${PRODUCT.name} knows about the project, validated: stack, goal, the project's own rules, commands, the active task, selected skills (short entries, not full text), skill packs, code map and Global Brain location, plus warnings. Call this first when starting work in a project.`,
    { projectPath }, READ,
    async (args, deps) => json(await loadProjectContext(target(args, deps), { registry: deps.registry, ...brainOptions(deps) }))),

  tool('get_active_task',
    `The current task (${PRODUCT.projectDir}/${MEMORY_FILES.activeTask}) while its status is active: the task, which skill files to open and why, and acceptance criteria. Call this when resuming work so the user does not have to brief you again.`,
    { projectPath }, READ,
    (args, deps) => {
      const dir = target(args, deps);
      const task = readActiveTask(dir);
      if (!task) return text(`No active task in ${dir}. Ask the user what to work on.`);
      if (task.status !== 'active') {
        return text(`${task.file} has status "${task.status}", so it is not the current task. Ask the user what to work on; \`${PRODUCT.command} task done\` archives it.`);
      }
      return text(fs.readFileSync(path.join(dir, task.file), 'utf8'));
    }),

  tool('get_project_status',
    `Resume a project (like \`${PRODUCT.command} start\`): refreshes the project's summary of the user's Global Brain, then reports the checks, the active task, goal, rules and skills. Writes only the generated summary ${PRODUCT.projectDir}/${MEMORY_FILES.globalBrainSummary}.`,
    { projectPath }, { ...WRITE, idempotentHint: true },
    async (args, deps) => {
      const dir = target(args, deps);
      const report = await startProject(dir, { registry: deps.registry, ...brainOptions(deps) });
      return report.initialized ? json(report) : notInitialized(dir);
    }),

  tool('analyze_project',
    'Detect the project from its files: framework, languages, package manager, UI libraries, testing tools, commands and which agents are set up. Reads only.',
    { projectPath }, READ,
    (args, deps) => json(detectProject(target(args, deps)))),

  tool('get_project_graph',
    `The project's code map (Graphify): where it is, its size, and whether code changed since it was built (a stale map can miss recent code; read changed files directly). With update: true it builds or refreshes the map with Graphify if installed, writing only graphify-out/. It never installs anything; \`${PRODUCT.command} map --install\` does, run by the user.`,
    { projectPath, update: z.boolean().optional().describe('Build or refresh the map (only call after the user agrees; it can take a minute)') },
    { ...WRITE, idempotentHint: true },
    async (args, deps) => {
      const dir = target(args, deps);
      if (args.update) {
        const result = await (deps.codeMap ?? ((d: string) => new CodeMap({ projectRoot: d })))(dir).generate({ targetDir: dir, force: true });
        if (result.skipped) return error(`${result.summary} Ask the user whether they want it; it is optional.`);
      }
      const paths = locateGraph(dir);
      if (!paths) return json({ available: false, hint: CODE_MAP_SETUP_HINT });
      const rel = (p: string) => path.relative(dir, p).replace(/\\/g, '/');
      return json({
        available: true,
        json: rel(paths.jsonPath),
        report: fs.existsSync(paths.reportPath) ? rel(paths.reportPath) : null,
        ...(readGraphStats(paths.jsonPath) ?? { nodeCount: 0, edgeCount: 0 }),
        freshness: mapFreshness(dir)
      });
    }),

  tool('list_skills',
    `List the skills in the ${PRODUCT.name} library (and the user's personal library), with trust levels.`,
    { category: z.string().optional().describe('Only skills in this category') }, READ,
    async (args, deps) => {
      const all = await deps.registry.getAllSkills();
      const skills = args.category ? all.filter(s => s.category === args.category) : all;
      return json(skills.map(s => ({ ...brief(s), author: s.author, frameworks: s.frameworks })));
    }),

  tool('search_skills',
    'Search the skill library by relevance to a query.',
    {
      query: z.string().describe('Search words or a task'),
      category: z.string().optional().describe('Only skills in this category'),
      framework: z.string().optional().describe('Only skills for this framework')
    }, READ,
    async (args, deps) => {
      const results = await new SkillDiscovery(deps.registry).search(args.query, {
        limit: 10,
        ...(args.category ? { category: args.category } : {}),
        ...(args.framework ? { framework: args.framework } : {})
      });
      return json(results.map(brief));
    }),

  tool('get_skill',
    'One skill by name: its metadata, trust level and full instructions.',
    { id: z.string().describe('Skill name, e.g. accessibility-baseline') }, READ,
    async (args, deps) => {
      const skill = await deps.registry.getSkill(args.id);
      if (!skill) return error(`Skill not found: ${args.id}. search_skills finds skills by topic.`);
      // `content` is read on demand (not an enumerable field), so it is added explicitly
      return json({ ...skill, trust: trustLevel(skill), trustNote: describeTrust(skill), content: skill.content });
    }),

  tool('recommend_skills',
    'The library skills that fit a task, each with the reason it was chosen, and the order to use them in. Returns none when nothing fits. Reads only.',
    {
      taskPrompt: z.string().describe('The task'),
      framework: z.string().optional().describe('Target framework, e.g. react, nextjs, vue'),
      projectPath
    }, READ,
    async (args, deps) => {
      const projectHints = hints(target(args, deps));
      return json(await new SkillOrchestrator(deps.registry).recommend(args.taskPrompt, { ...projectHints, ...(args.framework ? { framework: args.framework } : {}) }));
    }),

  tool('load_skills',
    'Full instructions of the library skills that closely match a task, within a token budget. Skills that do the same job (e.g. two animation libraries) are not loaded together: the one the project already depends on wins. Returns nothing when no skill fits.',
    {
      taskPrompt: z.string().describe('The task'),
      projectPath,
      tokenBudget: z.number().int().positive().optional().describe('Max tokens of full skill instructions (default 8000)')
    }, READ,
    async (args, deps) => {
      const loaded = await new SkillOrchestrator(deps.registry).loadSkillsForTask(args.taskPrompt, hints(target(args, deps)), args.tokenBudget ? { tokenBudget: args.tokenBudget } : {});
      const leftOut = loaded.excludedSkills.length ? `\n## Left out\n${loaded.excludedSkills.map(e => `- ${e.id}: ${e.reason}`).join('\n')}\n` : '';
      return text(loaded.formattedInstructions + leftOut);
    }),

  tool('get_project_skills',
    `The skills chosen for this project (${PRODUCT.projectDir}/${MEMORY_FILES.skillsLock} and ${PRODUCT.projectDir}/${MEMORY_FILES.skills}/): name, summary, why chosen, size and file path. Does not load full instructions.`,
    { projectPath }, READ,
    async (args, deps) => {
      const ctx = await loadProjectContext(target(args, deps), { registry: deps.registry, ...brainOptions(deps) });
      return json({ selected: ctx.skills.selected, project: ctx.skills.project, warnings: ctx.warnings });
    }),

  tool('load_project_skills',
    'Full instructions of only those project skills that closely match the current task, within a token budget. Returns nothing when no project skill fits.',
    {
      taskPrompt: z.string().describe('The task you are about to do'),
      projectPath,
      tokenBudget: z.number().int().positive().optional().describe('Max tokens of full skill instructions (default 8000)')
    }, READ,
    async (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const loaded = await loadProjectSkillsForTask(dir, deps.registry, args.taskPrompt, args.tokenBudget ? { tokenBudget: args.tokenBudget } : {});
      return text(loaded.formattedInstructions);
    }),

  tool('select_project_skills',
    `Add library skills to the project (${PRODUCT.projectDir}/${MEMORY_FILES.skillsLock}) and refresh the skill catalog. Only call this after the user agrees to use these skills in the project.`,
    {
      ids: z.array(z.string()).min(1).describe('Skill names to add'),
      reason: z.string().optional().describe('Why the project needs them'),
      projectPath
    }, WRITE,
    async (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const result = await selectSkills(dir, deps.registry, args.ids, args.reason ?? '');
      await writeCatalog(dir, deps.registry);
      return json(result);
    }),

  tool('list_skill_packs',
    'Skill packs (curated skill sets): which fit this project and why, which are added, and the skills each would add here. Reads only.',
    { projectPath }, READ,
    async (args, deps) => {
      const dir = target(args, deps);
      const info = detectProject(dir);
      const ctx = await loadProjectContext(dir, { registry: deps.registry, ...brainOptions(deps) });
      const added = new Set(ctx.packs.added);
      const packs = [];
      for (const pack of loadPacks()) {
        const { skills, missing } = await packSkills(pack, info, deps.registry);
        packs.push({
          name: pack.name,
          title: pack.title,
          description: pack.description,
          added: added.has(pack.name),
          fits: packReasons(pack, info, { projectDir: dir, goal: ctx.goal ?? '' }),
          skills,
          missing
        });
      }
      return json({ packs });
    }),

  ...(['add', 'remove'] as const).map(action => tool(`${action}_skill_packs`,
    action === 'add'
      ? `Add skill packs to the project (their skills go to ${PRODUCT.projectDir}/${MEMORY_FILES.skillsLock}, tagged with the pack). Only call this after the user agrees to add these packs.`
      : 'Remove skill packs from the project. Skills another pack still uses, and skills chosen by hand, stay. Only call this after the user agrees.',
    { names: z.array(z.string()).min(1).describe('Pack names, from list_skill_packs'), projectPath },
    action === 'add' ? WRITE : { ...WRITE, destructiveHint: true },
    async (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const byName = new Map(loadPacks().map(p => [p.name, p]));
      const unknown = args.names.filter(n => !byName.has(n));
      if (unknown.length) return error(`Unknown pack(s): ${unknown.join(', ')}. Packs: ${[...byName.keys()].join(', ')}`);
      const info = detectProject(dir);
      const results: Record<string, unknown> = {};
      for (const name of args.names) {
        const pack = byName.get(name)!;
        results[name] = action === 'add' ? await addPack(dir, deps.registry, pack, info) : removePack(dir, name);
      }
      await writeCatalog(dir, deps.registry);
      return json(results);
    })),

  tool('update_project_memory',
    `Record a decision the user confirmed as a decision record in ${PRODUCT.projectDir}/${MEMORY_FILES.decisions}/. Only for decisions the user agreed to; for a rule or lesson you would like kept, use propose_memory.`,
    {
      category: z.string().min(1).describe('Area, e.g. Architecture, Testing, Performance, UI/UX'),
      decision: z.string().min(1).describe('The decision, in one sentence'),
      context: z.string().min(1).describe('Why it was decided'),
      projectPath
    }, WRITE,
    (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const file = new MemoryEngine(brainOptions(deps)).recordProjectDecision(dir, args);
      return text(`Recorded the decision in ${file}: [${args.category}] ${args.decision}`);
    }),

  tool('propose_memory',
    `Propose a rule, convention or lesson for the project. It is written to ${PRODUCT.projectDir}/${MEMORY_FILES.proposedMemory}/ for the user to accept or delete; rules.md, context.md and playbook.md are never edited by agents.`,
    {
      topic: z.string().min(1).describe('A short title'),
      whatHappened: z.string().min(1).describe('The situation that taught this'),
      proposed: z.string().min(1).describe('The rule, convention or note to keep'),
      belongsIn: z.enum(PROPOSAL_TARGETS).describe('Where it would go once accepted'),
      projectPath
    }, WRITE,
    (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const folder = path.join(memoryDir(dir), MEMORY_FILES.proposedMemory);
      fs.mkdirSync(folder, { recursive: true });
      const base = `${today()}-${slug(args.topic)}`;
      let file = path.join(folder, `${base}.md`);
      for (let n = 2; fs.existsSync(file); n++) file = path.join(folder, `${base}-${n}.md`);
      const { projectPath: _ignored, ...proposal } = args;
      fs.writeFileSync(file, formatProposal(proposal), 'utf8');
      const rel = memoryPath(`${MEMORY_FILES.proposedMemory}/${path.basename(file)}`);
      return text(`Proposed in ${rel}. Tell the user it is waiting for their review.`);
    }),

  tool('intake_docs',
    `Fit a PRD and supporting docs (Markdown or text) into project memory, like \`${PRODUCT.command} intake\`: empty goal, architecture and conventions sections of context.md are filled; candidate rules, non-goals, acceptance criteria, decisions and a pointer to each doc become proposals in ${PRODUCT.projectDir}/${MEMORY_FILES.proposedMemory}/ for the user to review. Nothing a person wrote is replaced. Only call this after the user agrees; use dryRun to show the plan first.`,
    {
      files: z.array(z.string()).min(1).describe('Doc paths, relative to the project or absolute'),
      dryRun: z.boolean().optional().describe('Report what would be written; write nothing'),
      projectPath
    }, WRITE,
    (args, deps) => {
      const dir = target(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      const report = intakeDocs(dir, args.files, { dryRun: Boolean(args.dryRun) });
      return report.docs.length ? json(report) : error(`No doc could be read:\n${report.errors.join('\n')}`);
    }),

  tool('initialize_project',
    `Set the project up with ${PRODUCT.name}: create ${PRODUCT.projectDir}/ (memory, starter skills, skill catalog) and the ${PRODUCT.name} section of each agent's instruction file; files someone edited are kept. Only call this after the user agrees. Use dryRun to show what would be written.`,
    { projectPath, dryRun: z.boolean().optional().describe('Report what would be written; write nothing') },
    WRITE,
    async (args, deps) => json(await initProject(target(args, deps), { registry: deps.registry, dryRun: Boolean(args.dryRun), ...brainOptions(deps) }))),

  tool('get_global_brain',
    "The user's Global Brain: their confirmed preferences, design principles and coding standards across all projects, by file. Creates it from the defaults the first time; never changes a file the user has.",
    {}, { ...WRITE, idempotentHint: true },
    (_args, deps) => json(new MemoryEngine(brainOptions(deps)).getGlobalBrain()))
];

const BY_NAME = new Map(TOOLS.map(t => [t.name, t]));

/** Run one tool. Unknown tools, invalid input and failures come back as error results, never as throws. */
export async function handleTool(name: string, args: unknown, deps: ToolDeps): Promise<ToolResult> {
  const found = BY_NAME.get(name);
  if (!found) return error(`Unknown tool: ${name}. Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  try {
    return await found.call(args, deps);
  } catch (err) {
    return error(`${name} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
