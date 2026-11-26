/**
 * The Luci section in agent instruction files. It sits between
 * `<!-- LUCI — <AGENT> CONFIGURATION -->` and `<!-- END LUCI -->`; everything
 * outside the markers belongs to the project and is never changed.
 */
export const AGENT_MARKER_PREFIX = 'LUCI';
export const AGENT_END_MARKER = `<!-- END ${AGENT_MARKER_PREFIX} -->`;

/** Agent instruction files Luci writes, by agent (B2; Codex, Gemini CLI, Copilot and the generic file added in v0.2). */
export const AGENT_FILES = {
  claudeCode: 'CLAUDE.md',
  cursor: '.cursorrules',
  codex: 'AGENTS.md',
  gemini: 'GEMINI.md',
  copilot: '.github/copilot-instructions.md',
  generic: 'AGENT_INSTRUCTIONS.md'
} as const;

export type AgentId = keyof typeof AGENT_FILES;

/** Each agent's name, as its marker and messages show it. */
export const AGENT_LABELS: Readonly<Record<AgentId, string>> = {
  claudeCode: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  copilot: 'GitHub Copilot',
  generic: 'Generic Agents'
};

/** Short names for the command line (`luci init --agents codex,gemini`). */
export const AGENT_NAMES: Readonly<Record<string, AgentId>> = {
  claude: 'claudeCode', 'claude-code': 'claudeCode', cursor: 'cursor', codex: 'codex',
  gemini: 'gemini', 'gemini-cli': 'gemini', copilot: 'copilot', 'github-copilot': 'copilot', generic: 'generic'
};

/** Written in every project. The others are written when asked for, or when the project already has their file. */
export const DEFAULT_AGENTS: readonly AgentId[] = ['claudeCode', 'cursor'];

export function agentStartMarker(agentLabel: string): string {
  return `<!-- ${AGENT_MARKER_PREFIX} — ${agentLabel.toUpperCase()} CONFIGURATION -->`;
}
