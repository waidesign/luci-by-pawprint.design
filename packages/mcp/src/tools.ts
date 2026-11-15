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
import { DETAIL_LEVELS, FEEDBACK_STATUSES, formatFeedbackPrompt, layoutChangeText, sourceText as feedbackSourceText, type FeedbackItem } from '@luci/format/feedback';
import { compareComponentFiles, formatCheckRun, formatCheckRunWithNotes, formatCompareReport } from '@luci/format/capture';
import {
  CODE_MAP_SETUP_HINT,
  CodeMap,
  CheckStore,
  crawlSite,
  DesignStore,
  FeedbackStore,
  MemoryEngine,
  detectProject,
  findProjectRoot,
  locateGraph,
  mapFreshness,
  readGraphStats,
  initProject,
  intakeDocs,
  loadProjectContext,
  memoryDir,
  memoryPath,
  proposeCaptureRule,
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
  /** How often watch_feedback looks for new notes, in ms (default 1000; tests use less). */
  watchPollMs?: number;
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
/** watch_feedback waits this long by default, and at most this long (v0.2 watch mode). */
export const WATCH_DEFAULT_SECONDS = 120;
export const WATCH_MAX_SECONDS = 600;
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
const targetRoot = (args: { projectPath?: string | undefined }, deps: ToolDeps) => findProjectRoot(target(args, deps)).root;
const notInitialized = (dir: string) =>
  error(`No ${PRODUCT.projectDir}/ in ${dir}. Ask the user to run \`${PRODUCT.command} init\` there (or call initialize_project once they agree). Nothing was written.`);
const hasMemory = (dir: string) => fs.existsSync(memoryDir(findProjectRoot(dir).root));
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
      const root = targetRoot(args, deps);
      const dir = target(args, deps);
      const task = readActiveTask(dir);
      if (!task) return text(`No active task in ${dir}. Ask the user what to work on.`);
      if (task.status !== 'active') {
        return text(`${task.file} has status "${task.status}", so it is not the current task. Ask the user what to work on; \`${PRODUCT.command} task done\` archives it.`);
      }
      return text(fs.readFileSync(path.join(root, task.file), 'utf8'));
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
      const dir = targetRoot(args, deps);
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
      const dir = targetRoot(args, deps);
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
      const dir = targetRoot(args, deps);
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
      const dir = targetRoot(args, deps);
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
      const dir = targetRoot(args, deps);
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
    (_args, deps) => json(new MemoryEngine(brainOptions(deps)).getGlobalBrain())),

  // Feedback (FR30, changed 13 Nov 2026 at the user's request: read only; the person marks notes done
  // in the toolbar, no agent writes them)
  tool('list_feedback',
    `UI feedback notes the person left on their running app with Luci's dev toolbar (${PRODUCT.projectDir}/${MEMORY_FILES.feedback}/). By default the ones not done yet, each with its ID (P2-A3), comment, intent, priority, selector, text, source file, components and any layout steps. Reads only: the person marks notes done themselves.`,
    {
      status: z.enum(['open', 'all', ...FEEDBACK_STATUSES]).optional().describe('Which items: "open" (default), "all", or one status'),
      projectPath
    }, READ,
    (args, deps) => {
      const store = new FeedbackStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const which = args.status ?? 'open';
      const items = which === 'all' ? store.list() : which === 'open' ? store.open() : store.list({ status: [which] });
      if (!items.length) return text(which === 'open' ? 'No open feedback. The person can add some with the dev toolbar.' : `No feedback items with status "${which}".`);
      return json(items.map(feedbackBrief));
    }),

  tool('get_feedback_prompt',
    `The UI feedback notes not done yet as one page-grouped prompt: every note with its ID, grouped by page with route and source file, and how to report when done. Work through every page and report every ID in your answer; the person checks your work and marks notes done in their toolbar. Reads only.`,
    {
      detail: z.enum(DETAIL_LEVELS).optional().describe('compact: selector and text; standard (default): + source file and components; detailed: + computed styles'),
      projectPath
    }, READ,
    (args, deps) => {
      const store = new FeedbackStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const items = store.open();
      if (!items.length) return text('No open feedback. The person can add some with the dev toolbar.');
      return text(formatFeedbackPrompt(items, { detail: args.detail ?? 'standard' }));
    }),

  tool('watch_feedback',
    `Watch mode: wait while the person leaves new UI feedback notes with the dev toolbar, then return the new ones as one page-grouped prompt, as soon as there are any. Waits up to \`seconds\` (default ${WATCH_DEFAULT_SECONDS}, at most ${WATCH_MAX_SECONDS}); when nothing comes it says so, and you call it again to keep watching. Pass \`since\` from the previous answer so no note is missed or repeated. Apply each batch, report its IDs, then watch again. Reads only.`,
    {
      seconds: z.number().int().min(1).max(WATCH_MAX_SECONDS).optional().describe(`How long to wait for new notes (default ${WATCH_DEFAULT_SECONDS})`),
      since: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/).optional().describe('Only notes added after this time (ISO, UTC), as the previous answer gives it; default: from now'),
      detail: z.enum(DETAIL_LEVELS).optional().describe('compact, standard (default) or detailed'),
      projectPath
    }, READ,
    async (args, deps) => {
      const store = new FeedbackStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const since = args.since ?? new Date().toISOString();
      const seconds = args.seconds ?? WATCH_DEFAULT_SECONDS;
      const deadline = Date.now() + seconds * 1000;
      const poll = deps.watchPollMs ?? 1000;
      for (;;) {
        // New notes not copied or done yet; their files are written whole, so a read never sees half a note
        const fresh = store.list({ status: ['pending'] }).filter(i => i.createdAt > since);
        if (fresh.length) {
          const next = fresh.reduce((m, i) => (i.createdAt > m ? i.createdAt : m), since);
          return text(`${formatFeedbackPrompt(fresh, { detail: args.detail ?? 'standard' })}\nWatching: after this, call watch_feedback again with since "${next}" for the next notes.\n`);
        }
        const left = deadline - Date.now();
        if (left <= 0) return text(`No new feedback notes in ${seconds} second${seconds === 1 ? '' : 's'}. Call watch_feedback again with since "${since}" to keep watching.`);
        await new Promise(r => setTimeout(r, Math.min(poll, left)));
      }
    }),

  // Design captures saved from the toolbar into the project
  tool('list_captures',
    `Design captures saved into this project (${PRODUCT.projectDir}/${MEMORY_FILES.design}/): components, text, colors, spacing, systems, whole pages and basket exports, measured from live pages, and the project's own design baseline (project.system.typography/color/spacing.design.md, method authored: the values and tokens its stylesheets already have; reuse them). Read one with get_capture before building or restyling UI it describes. Reads only.`,
    { projectPath }, READ,
    (args, deps) => {
      const store = new DesignStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const files = store.list();
      return files.length ? json(files) : text('No design captures saved in this project yet.');
    }),

  tool('get_capture',
    'One saved design capture (a .design.md file from list_captures), as written. Use its values, tokens, states and image slots as the reference; the "Your instructions" section, when present, is the person\'s own request.',
    { file: z.string().min(1).describe('File name from list_captures, e.g. example-com.component.card.design.md'), projectPath }, READ,
    (args, deps) => {
      const store = new DesignStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const content = store.read(args.file);
      return content === null ? error(`No capture named ${args.file}. list_captures shows the saved ones.`) : text(content);
    }),

  tool('get_design_checks',
    `The latest design checks from the dev toolbar (v0.4, automatic design check): each built component checked against its design file, re-checked by the toolbar whenever the page changes (after your edits reload it), with every difference left. Use it after changing a component the person is checking, to see whether it now matches; when differences remain, fix them and read this again. Reads only (${PRODUCT.projectDir}/${MEMORY_FILES.design}/checks.json).`,
    { projectPath }, READ,
    (args, deps) => {
      const root = targetRoot(args, deps);
      const store = new CheckStore(root);
      if (!store.available) return notInitialized(store.projectDir);
      const runs = store.list();
      if (!runs.length) return text('No design checks yet. The person runs one with the dev toolbar (Capture, Check), and the toolbar sends each run here.');
      const feedback = new FeedbackStore(root);
      const openNotes = feedback.available ? feedback.open().filter(i => i.check) : [];
      return text(`# Design checks: ${runs.length}\n\n${runs.map(r => formatCheckRunWithNotes(r, openNotes)).join('\n\n')}\n`);
    }),

  tool('compare_captures',
    'Compare two saved component captures (from list_captures), part by part: parts, styles, state changes, motion and accessibility. Returns every value that differs as a table (What, A, B), values compared by meaning (any color notation, lengths within half a pixel). Reads only.',
    {
      a: z.string().min(1).describe('First component capture, e.g. example-com.component.button.design.md'),
      b: z.string().min(1).describe('Second component capture'),
      projectPath
    }, READ,
    (args, deps) => {
      const store = new DesignStore(targetRoot(args, deps));
      if (!store.available) return notInitialized(store.projectDir);
      const [a, b] = [store.read(args.a), store.read(args.b)];
      if (a === null || b === null) return error(`No capture named ${a === null ? args.a : args.b}. list_captures shows the saved ones.`);
      const result = compareComponentFiles(a, b);
      return result.ok ? text(formatCompareReport(result.value, { a: args.a, b: args.b })) : error(result.error);
    }),

  tool('propose_capture_rule',
    `Propose a project rule from a saved component capture: one line for rules.md ("Build every primary button like ${PRODUCT.projectDir}/${MEMORY_FILES.design}/<file>: ...") with its key values and state changes, written to ${PRODUCT.projectDir}/${MEMORY_FILES.proposedMemory}/ for the user to accept or delete. rules.md is never edited. Only when the user asks to make a capture a rule.`,
    { file: z.string().min(1).describe('A component capture from list_captures, e.g. example-com.component.primary-button.design.md'), projectPath }, WRITE,
    (args, deps) => {
      const dir = targetRoot(args, deps);
      if (!hasMemory(dir)) return notInitialized(dir);
      try {
        const rule = proposeCaptureRule(dir, args.file);
        return text(`${rule.existed ? 'Already waiting for review' : 'Proposed'} in ${rule.path}:\n${rule.proposal.proposed}\nTell the user it is waiting for their review: they keep it by moving the line into rules.md.`);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }),

  tool('crawl_site_design',
    'Crawl a list of routes or URLs of a site in one pass, extract typography, color and spacing systems from each page, and merge them into a unified site-level design system. Saves site systems into .luci/design/ and writes root DESIGN.md when stitch is true.',
    {
      urls: z.array(z.string().min(1)).min(1).describe('URLs or routes to crawl, e.g. ["http://localhost:3000/", "/pricing", "/blog"]'),
      base: z.string().optional().describe('Base URL if relative routes are given, e.g. "http://localhost:3000"'),
      stitch: z.boolean().optional().describe('Write root DESIGN.md in Google Stitch format (default: true)'),
      projectPath
    },
    WRITE,
    async (args, deps) => {
      const root = targetRoot(args, deps);
      if (!hasMemory(root)) return notInitialized(root);
      try {
        const res = await crawlSite({
          urls: args.urls,
          base: args.base,
          stitch: args.stitch ?? true,
          projectRoot: root
        });
        const summary = [
          `Crawled ${res.crawled.filter(c => !c.error).length} of ${res.pages.length} pages of ${res.site}:`,
          res.typography ? `  Typography: ${res.typography.roles.length} roles, ${res.typography.families.length} families` : null,
          res.color ? `  Color: ${res.color.roles.length} roles, ${res.color.tokens.length} tokens` : null,
          res.spacing ? `  Spacing: ${res.spacing.scale.length} scale values${res.spacing.baseUnit ? `, base unit ${res.spacing.baseUnit.px}px` : ''}` : null,
          res.conflicts.length ? `\nConflicts across pages (${res.conflicts.length}):\n${res.conflicts.map(c => `  - [${c.type}] ${c.conflict.what}`).join('\n')}` : null,
          res.written.length ? `\nSaved:\n${res.written.map(w => `  ${w}`).join('\n')}` : null
        ].filter(Boolean).join('\n');
        return text(summary);
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    }
  )
];

/** What an agent needs of an item to act on it. */
function feedbackBrief(i: FeedbackItem) {
  return {
    id: i.ref,
    status: i.status,
    page: i.page.route,
    ...(i.page.source ? { pageSource: i.page.source } : {}),
    intent: i.intent,
    priority: i.priority,
    comment: i.comment,
    selector: i.target.selector,
    element: i.target.element,
    ...(i.target.text ? { text: i.target.text } : {}),
    ...(i.target.selectedText ? { selectedText: i.target.selectedText } : {}),
    ...(i.target.source ? { source: feedbackSourceText(i.target.source) } : {}),
    ...(i.target.components?.length ? { components: i.target.components.join(' > ') } : {}),
    ...(i.layout ? { layout: { plannedAtWidth: i.layout.viewport.width, changes: i.layout.changes.map(layoutChangeText) } } : {}),
    ...(i.thread.length ? { thread: i.thread.map(m => `${m.from}: ${m.text}`) } : {}),
    ...(i.resolution ? { resolution: i.resolution } : {})
  };
}

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
