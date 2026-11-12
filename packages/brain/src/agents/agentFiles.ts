import path from 'node:path';
import { AGENT_FILES, agentStartMarker, type AgentId } from '@luci/format';
import type { ProjectInfo } from '../detect/detector.js';
import { agentBlock, upsertAgentBlock, type AgentFileResult } from './agentBlock.js';

interface AgentWriter {
  label: string;
  heading: string;
}

/** Claude Code and Cursor (B2). Codex, Gemini CLI, Copilot and a generic file follow in v0.2. */
const WRITERS: Readonly<Record<AgentId, AgentWriter>> = {
  claudeCode: { label: 'Claude Code', heading: 'Claude Code Project Guidelines' },
  cursor: { label: 'Cursor', heading: 'Cursor Project Rules' }
};

export const AGENT_IDS = Object.keys(WRITERS) as AgentId[];

/** Write or refresh one agent's instruction file. */
export function configureAgent(id: AgentId, projectPath: string, info: Pick<ProjectInfo, 'framework'>, options: { dryRun?: boolean } = {}): AgentFileResult {
  const writer = WRITERS[id];
  const marker = agentStartMarker(writer.label);
  const block = agentBlock({ agentLabel: writer.label, heading: writer.heading, extra: [`- Framework: ${info.framework}`] });
  return upsertAgentBlock(path.join(projectPath, AGENT_FILES[id]), block, marker, Boolean(options.dryRun));
}

/** Write or refresh every supported agent's instruction file. */
export function configureAgents(projectPath: string, info: Pick<ProjectInfo, 'framework'>, options: { dryRun?: boolean } = {}): Record<AgentId, AgentFileResult> {
  const out = {} as Record<AgentId, AgentFileResult>;
  for (const id of AGENT_IDS) out[id] = configureAgent(id, projectPath, info, options);
  return out;
}
