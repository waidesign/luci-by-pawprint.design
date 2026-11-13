export { PRODUCT } from '@luci/format';
export { readJsonFile, isRecord } from './fs/readJson.js';
export {
  type ProjectInfo,
  type PackageManager,
  UI_FRAMEWORKS,
  GRAPH_JSON,
  detectProject,
  detectCommands,
  hasSourceFiles
} from './detect/detector.js';
export {
  type ProjectFacts,
  TEMPLATES_DIR,
  memoryDir,
  memoryPath,
  projectFacts,
  autoSections,
  templateVars,
  renderTemplate,
  renderTemplateFile,
  buildBrainJson,
  readBrainJson,
  readBrainJsonObject,
  ensureLocalDir
} from './layout/brainLayout.js';
export { type WriteBrainOptions, type WriteReport, writeBrain } from './layout/writeBrain.js';
export { luciHome, userBrainDir, DEFAULT_BRAIN_DIR } from './memory/paths.js';
export {
  type MemoryEngineOptions,
  type DecisionInput,
  DECISION_HISTORY_FILE,
  MemoryEngine
} from './memory/memoryEngine.js';
export { GLOBAL_PREFERENCE_FILES, SNAPSHOT_TITLE, writeGlobalBrainSnapshot } from './memory/globalLink.js';
export { type ActiveTask, readActiveTask, archiveActiveTask, writeActiveTask } from './memory/activeTask.js';
export {
  type AgentFileAction,
  type AgentFileResult,
  agentBlock,
  upsertAgentBlock
} from './agents/agentBlock.js';
export { AGENT_IDS, configureAgent, configureAgents } from './agents/agentFiles.js';
export { type InitOptions, type InitReport, type PackSuggestion, initProject, suggestPacks } from './init/initProject.js';
export {
  type ContextSkill,
  type ProjectContext,
  type ProjectContextOptions,
  CONTEXT_VERSION,
  loadProjectContext,
  readProjectGoal,
  readProjectRules
} from './context/projectContext.js';
export { type FoundTool, TOOL_ENV, findTool, userBinDirs } from './codemap/toolLocator.js';
export {
  type GraphPaths,
  type GraphStats,
  type MapFreshness,
  type GenerateResult,
  type RunCommand,
  GRAPHIFY_OUT_DIR,
  GRAPHIFY_PACKAGE,
  CODE_MAP_SETUP_HINT,
  CodeMap,
  graphPaths,
  locateGraph,
  readGraphStats,
  builtAtCommit,
  mapFreshness
} from './codemap/codeMap.js';
export {
  type EnsureOptions,
  type EnsureResult,
  CODE_MAP_PITCH,
  GraphifyInstaller,
  ensureGraphify,
  uvInstallCommand
} from './codemap/installer.js';
export {
  type ImportOptions,
  type ImportReport,
  PROTOTYPE,
  convertSkillFiles,
  convertPrototypeSkillFolder,
  importPrototype,
  matchesTemplate,
  mergeIntoTemplate,
  renameText
} from './import/importPrototype.js';
export {
  type DocAnalysis,
  type DocSection,
  type IntakeReport,
  type SectionKind,
  INTAKE_EXTENSIONS,
  MAX_INTAKE_BYTES,
  analyzeDoc,
  intakeDocs,
  kindOf,
  splitSections
} from './intake/intake.js';
export { type NewFeedback, FeedbackError, FeedbackStore, writeAtomic } from './feedback/feedbackStore.js';
export { type DesignFile, DESIGN_FILE_NAME, MAX_DESIGN_BYTES, DesignError, DesignStore } from './design/designStore.js';
export { type StartReport, type UpdateReport, startProject, updateProject, generatedFiles } from './init/startUpdate.js';
export {
  type Check,
  type CheckStatus,
  type Diagnosis,
  type DiagnoseOptions,
  type ProjectSummary,
  diagnose
} from './doctor/diagnose.js';
