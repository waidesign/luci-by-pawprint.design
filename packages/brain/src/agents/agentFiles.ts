import fs from 'node:fs';
import path from 'node:path';
import { AGENT_FILES, AGENT_LABELS, DEFAULT_AGENTS, agentStartMarker, type AgentId } from '@luci/format';
import type { ProjectInfo } from '../detect/detector.js';
import { frameworkLine } from '../layout/brainLayout.js';
import { agentBlock, upsertAgentBlock, type AgentFileResult } from './agentBlock.js';

/** The heading of each agent's Luci section (B2). */
const HEADINGS: Readonly<Record<AgentId, string>> = {
  claudeCode: 'Claude Code Project Guidelines',
  cursor: 'Cursor Project Rules',
  codex: 'Codex Project Guidelines',
  gemini: 'Gemini CLI Project Guidelines',
  copilot: 'GitHub Copilot Custom Instructions',
  generic: 'Agent Instructions'
};

export const AGENT_IDS = Object.keys(AGENT_FILES) as AgentId[];

/**
 * The agents a project uses: Claude Code and Cursor always, the ones asked for, and any whose
 * instruction file the project already has (so `update` and `doctor` keep them current).
 */
export function projectAgents(projectPath: string, requested: readonly AgentId[] = []): AgentId[] {
  return AGENT_IDS.filter(id => DEFAULT_AGENTS.includes(id) || requested.includes(id) || fs.existsSync(path.join(projectPath, AGENT_FILES[id])));
}

/** Write or refresh one agent's instruction file. */
export function configureAgent(id: AgentId, projectPath: string, info: Pick<ProjectInfo, 'framework'> & Partial<Pick<ProjectInfo, 'packages'>>, options: { dryRun?: boolean } = {}): AgentFileResult {
  const label = AGENT_LABELS[id];
  const block = agentBlock({ agentLabel: label, heading: HEADINGS[id], extra: [frameworkLine({ framework: info.framework, packages: info.packages ?? [] })] });
  const file = path.join(projectPath, AGENT_FILES[id]);
  if (!options.dryRun) fs.mkdirSync(path.dirname(file), { recursive: true });
  return upsertAgentBlock(file, block, agentStartMarker(label), Boolean(options.dryRun));
}

/** Write or refresh the instruction file of every agent the project uses (see projectAgents). */
export function configureAgents(projectPath: string, info: Pick<ProjectInfo, 'framework'> & Partial<Pick<ProjectInfo, 'packages'>>, options: { dryRun?: boolean; agents?: readonly AgentId[] } = {}): Partial<Record<AgentId, AgentFileResult>> {
  const out: Partial<Record<AgentId, AgentFileResult>> = {};
  for (const id of projectAgents(projectPath, options.agents)) out[id] = configureAgent(id, projectPath, info, options);
  return out;
}
