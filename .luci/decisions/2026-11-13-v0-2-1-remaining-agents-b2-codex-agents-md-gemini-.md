# v0.2.1 remaining agents (B2): Codex AGENTS.md, Gemini CLI GEMINI.md, GitHub Copilot .github/copilot-instructions.md and a generic AGENT_INSTRUCTIONS.md get the Luci section. Claude Code and Cursor are always written; the others when asked (luci init --agents codex,gemini,copilot,generic or all) or when the project already has the file, so init, update, doctor and import keep them current without a setting. Doctor fails only for the two defaults; another agent file without the section is a warning.

- Date: 2026-11-13
- Status: accepted
- Area: agents

## What
v0.2.1 remaining agents (B2): Codex AGENTS.md, Gemini CLI GEMINI.md, GitHub Copilot .github/copilot-instructions.md and a generic AGENT_INSTRUCTIONS.md get the Luci section. Claude Code and Cursor are always written; the others when asked (luci init --agents codex,gemini,copilot,generic or all) or when the project already has the file, so init, update, doctor and import keep them current without a setting. Doctor fails only for the two defaults; another agent file without the section is a warning.

## Why
Ported from the prototype adapters (integrations/*). Writing all six files into every project would add files nobody uses; the presence of the file is the setting.

## Alternatives considered
_Not recorded._
