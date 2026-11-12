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
export { type InitOptions, type InitReport, initProject } from './init/initProject.js';
