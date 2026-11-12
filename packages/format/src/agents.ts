/**
 * The Luci section in agent instruction files. It sits between
 * `<!-- LUCI — <AGENT> CONFIGURATION -->` and `<!-- END LUCI -->`; everything
 * outside the markers belongs to the project and is never changed.
 */
export const AGENT_MARKER_PREFIX = 'LUCI';
export const AGENT_END_MARKER = `<!-- END ${AGENT_MARKER_PREFIX} -->`;

/** Agent instruction files Luci writes, by agent. Codex, Gemini CLI, Copilot and a generic file follow in v0.2 (B2). */
export const AGENT_FILES = {
  claudeCode: 'CLAUDE.md',
  cursor: '.cursorrules'
} as const;

export type AgentId = keyof typeof AGENT_FILES;

export function agentStartMarker(agentLabel: string): string {
  return `<!-- ${AGENT_MARKER_PREFIX} — ${agentLabel.toUpperCase()} CONFIGURATION -->`;
}
